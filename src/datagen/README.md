# MCP Data Generation Server

This server implements the Model Context Protocol (MCP) to provide notional data generation capabilities using Python libraries including Faker, Mimesis, NumPy, and SDV.

## Features

- Generate synthetic data tables based on specified schemas and parameters
- Support for multiple data generation libraries (Faker, Mimesis, SDV)
- Configurable row counts and column specifications
- Export data in CSV format

## Installation

```bash
pip install mcp-server-datagen
```

## Usage

The server exposes MCP tools for generating notional data:

- `generate_tables`: Generate multiple related tables based on a schema
- `define_schema`: Define table schemas with column specifications
- `export_csv`: Export generated data to CSV files

## Development

1. Create virtual environment and install dependencies:
```bash
uv venv
uv pip install -e ".[dev]"
```

2. Run type checking:
```bash
uv run --frozen pyright
```

3. Build package:
```bash
uv build
```
