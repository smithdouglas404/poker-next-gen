//! HTTP sidecar exposing rs_poker hand evaluation to the Go Nakama backend.
//! Powered by rs_poker (Rust) — the same engine referenced in the monorepo README.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use engine_math::{
    batch_rank, cfr_advise, compare_hands, deck_commitment, estimate_equity, gto_advise, icm, outs,
    omaha_showdown_winners, range_equity, rank_hand, rank_omaha, reproduce_from_seed,
    shuffle_deck_seeded, showdown_winners,
};
use serde::{Deserialize, Serialize};
use std::{cmp::Ordering, net::SocketAddr, sync::Arc};
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    engine: &'static str,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    engine: &'static str,
    library: &'static str,
}

#[derive(Deserialize)]
struct RankRequest {
    cards: String,
}

#[derive(Serialize)]
struct RankResponse {
    category: String,
    cards: String,
}

#[derive(Deserialize)]
struct CompareRequest {
    a: String,
    b: String,
}

#[derive(Serialize)]
struct CompareResponse {
    ordering: String,
    a_category: String,
    b_category: String,
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        engine: state.engine,
        library: "rs_poker 5.0.0",
    })
}

async fn rank(Json(req): Json<RankRequest>) -> Result<Json<RankResponse>, (StatusCode, String)> {
    let rank = rank_hand(&req.cards).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(RankResponse {
        category: format!("{:?}", rank.category()),
        cards: req.cards,
    }))
}

#[derive(Serialize)]
struct ShuffleResponse {
    cards: Vec<String>,
    deck_hash: String,   // SHA-256 over the final order (back-compat, tamper-evident)
    seed: String,        // hex 32-byte seed the backend reveals AFTER the hand
    commitment: String,  // SHA-256(seed) — the pre-deal commit shown to players
    source: &'static str,
}

async fn shuffle() -> Json<ShuffleResponse> {
    let s = shuffle_deck_seeded();
    Json(ShuffleResponse {
        deck_hash: deck_commitment(&s.cards),
        cards: s.cards,
        seed: s.seed_hex,
        commitment: s.commitment,
        source: "sha256ctr_seeded",
    })
}

#[derive(Deserialize)]
struct SeedVerifyRequest {
    seed: String,
    /// Optional expected commitment (SHA-256 of the seed) to check against.
    #[serde(default)]
    commitment: Option<String>,
}

#[derive(Serialize)]
struct SeedVerifyResponse {
    cards: Vec<String>,
    commitment: String,
    valid: bool,
}

/// Reproduce the deck from a revealed seed and confirm its commitment — the
/// server-side twin of the downloadable Python verifier.
async fn shuffle_verify(
    Json(req): Json<SeedVerifyRequest>,
) -> Result<Json<SeedVerifyResponse>, (StatusCode, String)> {
    let (cards, commitment) =
        reproduce_from_seed(&req.seed).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let valid = req.commitment.as_deref().map_or(true, |c| c.eq_ignore_ascii_case(&commitment));
    Ok(Json(SeedVerifyResponse {
        cards,
        commitment,
        valid,
    }))
}

async fn compare(Json(req): Json<CompareRequest>) -> Result<Json<CompareResponse>, (StatusCode, String)> {
    let ord = compare_hands(&req.a, &req.b).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let a_cat = rank_hand(&req.a)
        .map(|r| format!("{:?}", r.category()))
        .unwrap_or_default();
    let b_cat = rank_hand(&req.b)
        .map(|r| format!("{:?}", r.category()))
        .unwrap_or_default();
    let ordering = match ord {
        Ordering::Greater => "greater",
        Ordering::Less => "less",
        Ordering::Equal => "equal",
    };
    Ok(Json(CompareResponse {
        ordering: ordering.to_string(),
        a_category: a_cat,
        b_category: b_cat,
    }))
}

#[derive(Deserialize)]
struct EquityRequest {
    holes: Vec<String>,
    board: String,
    #[serde(default = "default_iterations")]
    iterations: usize,
}

fn default_iterations() -> usize {
    2000
}

#[derive(Serialize)]
struct EquityResponse {
    equity: Vec<f32>,
    iterations: usize,
}

async fn equity(Json(req): Json<EquityRequest>) -> Result<Json<EquityResponse>, (StatusCode, String)> {
    let holes: Vec<&str> = req.holes.iter().map(String::as_str).collect();
    let eq = estimate_equity(&holes, &req.board, req.iterations)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(EquityResponse {
        equity: eq,
        iterations: req.iterations.clamp(100, 50_000),
    }))
}

#[derive(Deserialize)]
struct ShowdownRequest {
    holes: Vec<String>,
    board: String,
}

#[derive(Serialize)]
struct ShowdownResponse {
    winners: Vec<usize>,
    categories: Vec<String>,
}

async fn showdown(Json(req): Json<ShowdownRequest>) -> Result<Json<ShowdownResponse>, (StatusCode, String)> {
    let holes: Vec<&str> = req.holes.iter().map(String::as_str).collect();
    let winners = showdown_winners(&holes, &req.board).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let categories: Vec<String> = holes
        .iter()
        .map(|h| rank_hand(&format!("{h}{}", req.board)).map(|r| format!("{:?}", r.category())))
        .collect::<Result<_, _>>()
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(ShowdownResponse { winners, categories }))
}

#[derive(Deserialize)]
struct BatchRankRequest {
    hands: Vec<String>,
}

#[derive(Serialize)]
struct BatchRankResponse {
    categories: Vec<String>,
}

async fn batch_rank_handler(
    Json(req): Json<BatchRankRequest>,
) -> Result<Json<BatchRankResponse>, (StatusCode, String)> {
    let hands: Vec<&str> = req.hands.iter().map(String::as_str).collect();
    let categories = batch_rank(&hands).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(BatchRankResponse { categories }))
}

#[derive(Deserialize)]
struct OmahaRankRequest {
    hole: String,
    board: String,
}

async fn omaha_rank(
    Json(req): Json<OmahaRankRequest>,
) -> Result<Json<RankResponse>, (StatusCode, String)> {
    let rank = rank_omaha(&req.hole, &req.board).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(RankResponse {
        category: format!("{:?}", rank.category()),
        cards: format!("{}{}", req.hole, req.board),
    }))
}

async fn omaha_showdown(
    Json(req): Json<ShowdownRequest>,
) -> Result<Json<ShowdownResponse>, (StatusCode, String)> {
    let holes: Vec<&str> = req.holes.iter().map(String::as_str).collect();
    let winners =
        omaha_showdown_winners(&holes, &req.board).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let categories: Vec<String> = holes
        .iter()
        .map(|h| rank_omaha(h, &req.board).map(|r| format!("{:?}", r.category())))
        .collect::<Result<_, _>>()
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(ShowdownResponse { winners, categories }))
}

#[derive(Deserialize)]
struct GtoAdviseRequest {
    hero_hole: String,
    villain_holes: Vec<String>,
    board: String,
    pot: f64,
    to_call: f64,
    #[serde(default = "default_iterations")]
    iterations: usize,
}

async fn gto_advise_handler(
    Json(req): Json<GtoAdviseRequest>,
) -> Result<Json<engine_math::GtoAdvice>, (StatusCode, String)> {
    let villains: Vec<&str> = req.villain_holes.iter().map(String::as_str).collect();
    let advice = gto_advise(
        &req.hero_hole,
        &villains,
        &req.board,
        req.pot,
        req.to_call,
        req.iterations,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(advice))
}

#[derive(Deserialize)]
struct CfrAdviseRequest {
    hero_hole: String,
    villain_hole: String,
    #[serde(default)]
    board: String,
    hero_stack: f32,
    villain_stack: f32,
    #[serde(default)]
    pot: f32,
    #[serde(default)]
    to_call: f32,
    #[serde(default = "default_cfr_deadline_ms")]
    deadline_ms: u64,
    #[serde(default = "default_cfr_iterations")]
    iterations: u64,
}

fn default_cfr_deadline_ms() -> u64 {
    5000
}

fn default_cfr_iterations() -> u64 {
    1000
}

async fn cfr_advise_handler(
    Json(req): Json<CfrAdviseRequest>,
) -> Result<Json<engine_math::CfrAdvice>, (StatusCode, String)> {
    let advice = cfr_advise(
        &req.hero_hole,
        &req.villain_hole,
        &req.board,
        req.hero_stack,
        req.villain_stack,
        req.pot,
        req.to_call,
        req.deadline_ms,
        req.iterations,
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(advice))
}

#[derive(Deserialize)]
struct OutsRequest {
    hero_hole: String,
    villain_holes: Vec<String>,
    #[serde(default)]
    board: String,
}

async fn outs_handler(
    Json(req): Json<OutsRequest>,
) -> Result<Json<engine_math::OutsReport>, (StatusCode, String)> {
    let villains: Vec<&str> = req.villain_holes.iter().map(String::as_str).collect();
    let report = outs(&req.hero_hole, &villains, &req.board).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(report))
}

#[derive(Deserialize)]
struct RangeEquityRequest {
    hero_range: String,
    villain_range: String,
    #[serde(default)]
    board: String,
    #[serde(default = "default_range_matchups")]
    matchups: usize,
}

fn default_range_matchups() -> usize {
    500
}

async fn range_equity_handler(
    Json(req): Json<RangeEquityRequest>,
) -> Result<Json<engine_math::RangeEquity>, (StatusCode, String)> {
    let re = range_equity(&req.hero_range, &req.villain_range, &req.board, req.matchups)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(re))
}

#[derive(Deserialize)]
struct IcmRequest {
    chips: Vec<f64>,
    payouts: Vec<f64>,
    #[serde(default = "default_icm_trials")]
    trials: usize,
}

fn default_icm_trials() -> usize {
    5000
}

async fn icm_handler(
    Json(req): Json<IcmRequest>,
) -> Result<Json<engine_math::IcmResult>, (StatusCode, String)> {
    let res = icm(req.chips, req.payouts, req.trials).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(res))
}

#[derive(Deserialize)]
struct DeckVerifyRequest {
    cards: Vec<String>,
    deck_hash: String,
}

#[derive(Serialize)]
struct DeckVerifyResponse {
    valid: bool,
    computed_hash: String,
}

async fn deck_verify(
    Json(req): Json<DeckVerifyRequest>,
) -> Result<Json<DeckVerifyResponse>, (StatusCode, String)> {
    let computed = deck_commitment(&req.cards);
    Ok(Json(DeckVerifyResponse {
        valid: computed == req.deck_hash,
        computed_hash: computed,
    }))
}

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        engine: "engine-math-rs-poker",
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/rank", post(rank))
        .route("/shuffle", post(shuffle))
        .route("/shuffle/verify", post(shuffle_verify))
        .route("/compare", post(compare))
        .route("/equity", post(equity))
        .route("/showdown", post(showdown))
        .route("/batch_rank", post(batch_rank_handler))
        .route("/omaha/rank", post(omaha_rank))
        .route("/omaha/showdown", post(omaha_showdown))
        .route("/gto/advise", post(gto_advise_handler))
        .route("/gto/solve", post(cfr_advise_handler))
        .route("/outs", post(outs_handler))
        .route("/equity/range", post(range_equity_handler))
        .route("/icm", post(icm_handler))
        .route("/deck/verify", post(deck_verify))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("engine-math (rs_poker) listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
