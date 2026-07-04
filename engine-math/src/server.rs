//! HTTP sidecar exposing rs_poker hand evaluation to the Go Nakama backend.
//! Powered by rs_poker (Rust) — the same engine referenced in the monorepo README.

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use engine_math::{compare_hands, rank_hand};
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

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        engine: "engine-math-rs-poker",
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/rank", post(rank))
        .route("/compare", post(compare))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("engine-math (rs_poker) listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
