//! HTTP sidecar exposing rs_poker hand evaluation to the Go Nakama backend.
//! Powered by rs_poker (Rust) — the same engine referenced in the monorepo README.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use engine_math::{batch_rank, compare_hands, estimate_equity, rank_hand, showdown_winners, shuffle_deck};
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
    source: &'static str,
}

async fn shuffle() -> Json<ShuffleResponse> {
    Json(ShuffleResponse {
        cards: shuffle_deck(),
        source: "csprng_os",
    })
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

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        engine: "engine-math-rs-poker",
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/rank", post(rank))
        .route("/shuffle", post(shuffle))
        .route("/compare", post(compare))
        .route("/equity", post(equity))
        .route("/showdown", post(showdown))
        .route("/batch_rank", post(batch_rank_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("engine-math (rs_poker) listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
