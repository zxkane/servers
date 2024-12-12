import asyncio
import json
from typing import Any, Dict, List, Sequence

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource
from mcp.shared.exceptions import McpError

from mcp_server_datagen.synthetic import SyntheticDataGenerator


class DataGenServer:
    """MCP server for generating notional data."""

    def __init__(self):
        self.default_schemas = {
            "customers": {
                "customer_id": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 10000,
                    "max": 99999
                },
                "first_name": {
                    "type": "first_name",
                    "generator": "faker"
                },
                "last_name": {
                    "type": "last_name",
                    "generator": "faker"
                },
                "email": {
                    "type": "email",
                    "generator": "faker"
                },
                "phone": {
                    "type": "phone_number",
                    "generator": "faker"
                },
                "address": {
                    "type": "address",
                    "generator": "faker"
                },
                "age": {
                    "type": "int",
                    "min": 18,
                    "max": 100
                },
                "credit_score": {
                    "type": "int",
                    "min": 300,
                    "max": 850
                },
                "active": {
                    "type": "boolean"
                }
            },
            "policies": {
                "policy_id": {
                    "type": "integer",
                    "generator": "numpy",
                    "min": 100000,
                    "max": 999999,
                    "prefix": "POL-2024-"
                },
                "customer_id": {
                    "type": "int",
                    "min": 10000,
                    "max": 99999,
                    "correlated": True
                },
                "policy_type": {
                    "type": "category",
                    "categories": ["Auto", "Home", "Life", "Health"]
                },
                "start_date": {
                    "type": "date_this_year",
                    "generator": "faker"
                },
                "premium": {
                    "type": "float",
                    "min": 500.0,
                    "max": 5000.0
                },
                "deductible": {
                    "type": "float",
                    "min": 250.0,
                    "max": 2000.0
                },
                "coverage_amount": {
                    "type": "int",
                    "min": 50000,
                    "max": 1000000
                },
                "risk_score": {
                    "type": "int",
                    "min": 1,
                    "max": 100
                },
                "status": {
                    "type": "category",
                    "categories": ["Active", "Pending", "Expired", "Cancelled"]
                }
            },
            "claims": {
                "claim_id": {
                    "type": "int",
                    "min": 100000,
                    "max": 999999
                },
                "policy_id": {
                    "type": "integer",
                    "generator": "numpy",
                    "min": 100000,
                    "max": 999999,
                    "prefix": "POL-2024-",
                    "correlated": True
                },
                "date_filed": {
                    "type": "date_this_year",
                    "generator": "faker"
                },
                "amount": {
                    "type": "float",
                    "min": 100.0,
                    "max": 50000.0
                },
                "status": {
                    "type": "category",
                    "categories": ["Filed", "Under Review", "Approved", "Denied"]
                },
                "description": {
                    "type": "text",
                    "generator": "faker"
                }
            }
        }
        self.generator = SyntheticDataGenerator()
        self.generator.default_schemas = self.default_schemas

    async def list_tools(self) -> List[Tool]:
        """List available data generation tools."""
        return [
            Tool(
                name="generate_custom_tables",  # Renamed from generate_tables
                description="""Generate synthetic data tables with custom schemas.

                This tool creates multiple tables of synthetic data based on provided schemas. It supports:
                - Basic data types (integer, float, string, boolean)
                - Categorical data with custom categories
                - Realistic personal data via Faker (names, emails, addresses)
                - Numeric data with configurable ranges via NumPy
                - Related tables with correlated IDs

                When using the 'faker' generator, you must specify one of the supported faker types in the 'type' field:
                - Personal: first_name, last_name, email, phone_number, address
                - Dates: date_of_birth, date_this_year, date_this_decade
                - Text: text (default for generic strings)

                Default schemas are available for common scenarios (customers, policies, claims).""",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "tables": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of table names to generate. Use default schemas or provide custom schemas.",
                            "examples": ["customers", "policies", "claims"]
                        },
                        "rows": {
                            "type": "integer",
                            "minimum": 1,
                            "description": "Number of rows to generate for each table. Default: 1000"
                        },
                        "schemas": {
                            "type": "object",
                            "description": "Custom schema definitions for tables. Optional if using default schemas.",
                            "additionalProperties": {
                                "type": "object",
                                "description": "Schema definition for a single table",
                                "additionalProperties": {
                                    "type": "object",
                                    "description": "Column definition",
                                    "properties": {
                                        "type": {
                                            "type": "string",
                                            "description": """Data type for the column. Valid options:
                                            - Basic: 'string', 'integer'/'int', 'float', 'boolean'
                                            - Categorical: 'category'
                                            - Faker types (use with 'faker' generator): 'first_name', 'last_name', 'email',
                                              'phone_number', 'address', 'date_of_birth', 'text', 'date_this_year',
                                              'date_this_decade'. Generic 'string' type defaults to 'text'."""
                                        },
                                        "generator": {
                                            "type": "string",
                                            "description": """Library to use for generating values. Valid options:
                                            - 'numpy': For numeric and categorical data
                                            - 'faker': For realistic personal/business data. Must be used with a supported
                                              faker type (see type field). Will generate null values if used with
                                              unsupported types.
                                            - 'mimesis': Alternative to Faker for personal data"""
                                        },
                                        "min": {
                                            "type": "number",
                                            "description": "Minimum value for numeric types (integer/float). Required for numeric types."
                                        },
                                        "max": {
                                            "type": "number",
                                            "description": "Maximum value for numeric types (integer/float). Required for numeric types."
                                        },
                                        "categories": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                            "description": "List of valid categories for 'category' type. Required for category type."
                                        },
                                        "correlated": {
                                            "type": "boolean",
                                            "description": "If true, generates values that match existing IDs in other tables. Used for foreign keys."
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["tables"]
                }
            ),
            Tool(
                name="generate_insurance_data",
                description="""Generate insurance-related data tables using default schemas.

                Generates three tables with realistic insurance data:
                - customers: Customer information (names, contact details, etc.)
                - policies: Insurance policy details with proper ID prefixes
                - claims: Claims data with relationships to policies

                All tables maintain referential integrity and include:
                - Customers: IDs, names, contact info, credit scores
                - Policies: IDs with prefixes, types, dates, premiums, coverage
                - Claims: IDs, dates, types, amounts, status updates

                The data is generated using predefined schemas optimized for insurance scenarios.""",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "rows": {
                            "type": "integer",
                            "minimum": 1,
                            "description": "Number of rows to generate for each table"
                        }
                    },
                    "required": ["rows"]
                }
            )
        ]

    async def handle_generate_tables(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle generate_tables tool requests."""
        tables = params.get("tables", [])
        rows = params.get("rows", 1000)
        custom_schemas = params.get("schemas", {})

        if rows <= 0:
            raise ValueError("Row count must be positive")

        results = {}
        try:
            for table_name in tables:
                if table_name not in self.default_schemas and table_name not in custom_schemas:
                    raise ValueError(f"Unknown table: {table_name}")

                # Use custom schema if provided, otherwise use default
                schema = custom_schemas.get(table_name, self.default_schemas.get(table_name, {}))
                data = await self.generator.generate_synthetic_data(
                    table_name=table_name,
                    schema=schema,
                    rows=rows
                )
                results[table_name] = data

            return results

        except ValueError as e:
            # Re-raise validation errors directly
            raise e
        except Exception as e:
            # Wrap unexpected errors in McpError
            raise McpError(f"Error generating data: {str(e)}")

    async def handle_generate_insurance_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle generate_insurance_data tool requests."""
        rows = params.get("rows", 1000)
        if rows <= 0:
            raise ValueError("Row count must be positive")

        results = {}
        try:
            for table_name in ["customers", "policies", "claims"]:
                schema = self.default_schemas[table_name]
                data = await self.generator.generate_synthetic_data(
                    table_name=table_name,
                    schema=schema,
                    rows=rows
                )
                results[table_name] = data
            return results
        except Exception as e:
            raise McpError(f"Error generating data: {str(e)}")


async def serve() -> None:
    """Start the MCP server."""
    server = Server("mcp-datagen")
    datagen_server = DataGenServer()

    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """List available data generation tools."""
        return await datagen_server.list_tools()

    @server.call_tool()
    async def call_tool(
        name: str, arguments: Dict[str, Any]
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """Handle tool calls."""
        if name == "generate_tables":
            result = await datagen_server.handle_generate_tables(arguments)
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"tables": result}, indent=2)
                )
            ]
        raise McpError(f"Unknown tool: {name}")

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options)


if __name__ == "__main__":
    asyncio.run(serve())
