use std::env;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use vibetask_mcp::mcp_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing - output to stderr for MCP compatibility
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vibetask_mcp=info".into()),
        )
        .with(
            tracing_subscriber::fmt::layer().with_writer(std::io::stderr), // Send logs to stderr, not stdout
        )
        .init();

    info!(
        "Starting VibeTask MCP Orchestrator v{}",
        env!("CARGO_PKG_VERSION")
    );

    // Parse command line arguments
    let args: Vec<String> = env::args().collect();

    // Handle different commands
    match args.get(1).map(|s| s.as_str()) {
        Some("health") => {
            // Health check mode
            let config_path = parse_config_path_from_args(&args[2..]);
            info!("Running health check with config: {}", config_path);

            match mcp_server::health_check(config_path).await {
                Ok(()) => std::process::exit(0),
                Err(e) => {
                    error!("Health check failed: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Some("validate") => {
            // Configuration validation mode
            let config_path = parse_config_path_from_args(&args[2..]);
            info!("Validating configuration: {}", config_path);

            match mcp_server::validate_config(config_path).await {
                Ok(()) => {
                    println!("Configuration is valid");
                    std::process::exit(0);
                }
                Err(e) => {
                    eprintln!("Configuration validation failed: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Some("--help") | Some("-h") => {
            print_help();
            std::process::exit(0);
        }
        Some("--config") => {
            // --config flag at start means default server mode with config
            let config_path = parse_config_path_from_args(&args[1..]);
            info!("Using config file: {}", config_path);

            // Create and run MCP server with comprehensive error recovery
            match mcp_server::create_and_run_server(config_path).await {
                Ok(()) => {
                    info!("MCP server completed successfully");
                    Ok(())
                }
                Err(e) => {
                    error!("MCP server failed: {}", e);

                    // Graceful error handling - never crash the binary
                    match e.downcast_ref::<vibetask_mcp::mcp_server::InitError>() {
                        Some(init_error) => {
                            error!("Initialization failed: {}", init_error);
                            eprintln!(
                                "❌ Failed to initialize VibeTask MCP server: {}",
                                init_error
                            );
                            eprintln!("💡 Check your configuration and agent keys");
                        }
                        None => {
                            error!("Runtime error: {}", e);
                            eprintln!("❌ MCP server error: {}", e);
                            eprintln!("💡 The server encountered an unexpected error");
                        }
                    }

                    // Return error but don't panic - allows for restart/retry
                    Err(e)
                }
            }
        }
        Some(unknown) if unknown.starts_with('-') => {
            eprintln!("Unknown option: {}", unknown);
            print_help();
            std::process::exit(1);
        }
        _ => {
            // Default: Start MCP server
            let config_path = parse_config_path_from_args(&args[1..]);
            info!("Using config file: {}", config_path);

            // Create and run MCP server with comprehensive error recovery
            match mcp_server::create_and_run_server(config_path).await {
                Ok(()) => {
                    info!("MCP server completed successfully");
                    Ok(())
                }
                Err(e) => {
                    error!("MCP server failed: {}", e);

                    // Graceful error handling - never crash the binary
                    match e.downcast_ref::<vibetask_mcp::mcp_server::InitError>() {
                        Some(init_error) => {
                            error!("Initialization failed: {}", init_error);
                            eprintln!(
                                "❌ Failed to initialize VibeTask MCP server: {}",
                                init_error
                            );
                            eprintln!("💡 Check your configuration and agent keys");
                        }
                        None => {
                            error!("Runtime error: {}", e);
                            eprintln!("❌ MCP server error: {}", e);
                            eprintln!("💡 The server encountered an unexpected error");
                        }
                    }

                    // Return error but don't panic - allows for restart/retry
                    Err(e)
                }
            }
        }
    }
}

fn parse_config_path_from_args(args: &[String]) -> String {
    // Look for --config flag
    for i in 0..args.len() {
        if args[i] == "--config" && i + 1 < args.len() {
            return args[i + 1].clone();
        }
    }

    // Default fallback
    "./config/vibe-mcp.toml".to_string()
}

fn print_help() {
    println!("VibeTask MCP Orchestrator v{}", env!("CARGO_PKG_VERSION"));
    println!("Stateless Rust MCP sidecar for intelligent Kanban workflows");
    println!();
    println!("USAGE:");
    println!("    vibetask-mcp [COMMAND] [OPTIONS]");
    println!();
    println!("COMMANDS:");
    println!("    <default>    Start the MCP server (default behavior)");
    println!("    health       Perform health check and exit");
    println!("    validate     Validate configuration and exit");
    println!("    --help, -h   Show this help message");
    println!();
    println!("OPTIONS:");
    println!("    --config <PATH>    Path to configuration file (default: ./config/vibe-mcp.toml)");
    println!();
    println!("EXAMPLES:");
    println!(
        "    vibetask-mcp                                    # Start server with default config"
    );
    println!(
        "    vibetask-mcp --config /path/to/config.toml     # Start server with custom config"
    );
    println!("    vibetask-mcp health --config ./config.toml     # Health check");
    println!("    vibetask-mcp validate --config ./config.toml   # Validate configuration");
    println!();
    println!("For more information, visit: https://github.com/GnosticEchos/VibeTask");
}
