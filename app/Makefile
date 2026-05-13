# VibeTask MCP Orchestrator - Development Makefile

.PHONY: help install-hooks check test fmt clippy audit clean build release doc generate-types

# Integrated terminals (e.g. Cursor) sometimes set ARGV0 to a shim name; rustup's cargo
# driver then errors with: unknown proxy name: 'cursor'. Prefix every cargo invocation.
CARGO := unset ARGV0 && cargo

# Default target
help:
	@echo "VibeTask MCP Orchestrator - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  install-hooks    Install pre-commit hooks"
	@echo ""
	@echo "Development:"
	@echo "  generate-types   Generate Rust types from OpenAPI spec"
	@echo "  check           Run all checks (fmt, clippy, test)"
	@echo "  test            Run tests"
	@echo "  fmt             Format code"
	@echo "  clippy          Run clippy lints"
	@echo "  audit           Run security audit"
	@echo ""
	@echo "Build:"
	@echo "  build           Build debug version"
	@echo "  release         Build release version"
	@echo "  doc             Generate documentation"
	@echo ""
	@echo "Cleanup:"
	@echo "  clean           Clean build artifacts"

# Install pre-commit hooks
install-hooks:
	@echo "Installing pre-commit hooks..."
	@if command -v pre-commit >/dev/null 2>&1; then \
		pre-commit install; \
		echo "✅ Pre-commit hooks installed"; \
	else \
		echo "❌ pre-commit not found. Install with: pip install pre-commit"; \
		exit 1; \
	fi

# Generate Rust types from OpenAPI spec
generate-types:
	@echo "Generating Rust types from OpenAPI specification..."
	@echo "🔄 Using build script to generate types..."
	@cd crates/vibetask-mcp && $(CARGO) build
	@echo "✅ Type generation complete"

# Run all checks
check: fmt clippy test audit
	@echo "✅ All checks passed"

# Format code
fmt:
	@echo "Formatting code..."
	@$(CARGO) fmt --all
	@echo "✅ Code formatted"

# Run clippy
clippy:
	@echo "Running clippy..."
	@$(CARGO) clippy --all-targets --all-features -- -D warnings
	@echo "✅ Clippy checks passed"

# Run tests
test:
	@echo "Running tests..."
	@$(CARGO) test --all-features
	@echo "✅ Tests passed"

# Run security audit
audit:
	@echo "Running security audit..."
	@if command -v cargo-audit >/dev/null 2>&1; then \
		$(CARGO) audit; \
	else \
		echo "Installing cargo-audit..."; \
		$(CARGO) install cargo-audit; \
		$(CARGO) audit; \
	fi
	@echo "✅ Security audit passed"

# Build debug version
build:
	@echo "Building debug version..."
	@$(CARGO) build --all-features
	@echo "✅ Debug build complete"

# Build release version
release:
	@echo "Building release version..."
	@$(CARGO) build --all-features --release
	@echo "✅ Release build complete"

# Generate documentation
doc:
	@echo "Generating documentation..."
	@$(CARGO) doc --all-features --no-deps --document-private-items --open
	@echo "✅ Documentation generated"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@$(CARGO) clean
	@echo "✅ Clean complete"

# Development workflow
dev-setup: install-hooks
	@echo "Setting up development environment..."
	@rustup component add rustfmt clippy
	@$(CARGO) install cargo-audit cargo-deny
	@echo "✅ Development environment ready"

# CI simulation (run what CI runs)
ci: fmt clippy test audit
	@echo "Running CI simulation..."
	@$(CARGO) build --all-features --release
	@$(CARGO) doc --all-features --no-deps --document-private-items
	@echo "✅ CI simulation complete"