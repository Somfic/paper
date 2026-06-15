FROM rust:1-bookworm AS chef
RUN cargo install cargo-chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

COPY . .
RUN bun install --cwd frontend --trust

# `draad::include_generated!` emits `frontend/src/lib/schema/*.ts` as a
# side effect of `cargo build` (macro-expansion time, no build.rs), so the
# release build must precede the frontend build.
RUN cargo build --release

RUN bun run --cwd frontend build

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/paper /usr/local/bin/paper
COPY --from=builder /app/frontend/build /app/frontend/build
COPY --from=builder /app/migrations /app/migrations

WORKDIR /app
ENTRYPOINT ["paper"]
