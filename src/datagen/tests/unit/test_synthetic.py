"""Unit tests for synthetic data generation."""
import pytest
import numpy as np
from mcp_server_datagen.synthetic import SyntheticDataGenerator


@pytest.fixture
def data_generator():
    """Create a data generator instance for testing."""
    return SyntheticDataGenerator()


@pytest.fixture
def sample_schema():
    """Create a sample schema for testing."""
    return {
        "id": {"type": "int", "min": 1, "max": 1000},
        "name": {"type": "string", "categories": ["Alice", "Bob", "Charlie"]},
        "age": {"type": "int", "min": 18, "max": 100},
        "score": {"type": "float", "min": 0.0, "max": 1.0},
    }


@pytest.mark.asyncio
async def test_create_metadata(data_generator, sample_schema):
    """Test metadata creation from schema."""
    metadata = data_generator.create_metadata("test_table", sample_schema)

    # Verify all columns are present
    assert set(sample_schema.keys()) == set(metadata.columns.keys())

    # Verify column types are mapped correctly
    assert metadata.columns["id"]["sdtype"] == "numerical"
    assert metadata.columns["name"]["sdtype"] == "categorical"
    assert metadata.columns["age"]["sdtype"] == "numerical"
    assert metadata.columns["score"]["sdtype"] == "numerical"


@pytest.mark.asyncio
async def test_generate_synthetic_data(data_generator, sample_schema):
    """Test synthetic data generation."""
    rows = 100
    data = await data_generator.generate_synthetic_data("test_table", sample_schema, rows)

    # Verify all columns are present
    assert set(data.keys()) == set(sample_schema.keys())

    # Verify number of rows
    assert all(len(values) == rows for values in data.values())

    # Verify data types and ranges
    assert all(isinstance(x, (int, np.integer)) for x in data["id"])
    assert all(1 <= x <= 1000 for x in data["id"])

    assert all(isinstance(x, str) for x in data["name"])
    assert all(x in ["Alice", "Bob", "Charlie"] for x in data["name"])

    assert all(isinstance(x, (int, np.integer)) for x in data["age"])
    assert all(18 <= x <= 100 for x in data["age"])

    assert all(isinstance(x, (float, np.floating)) for x in data["score"])
    assert all(0.0 <= x <= 1.0 for x in data["score"])


@pytest.mark.asyncio
async def test_generate_large_dataset(data_generator):
    """Test generation of a large dataset."""
    schema = {
        "customer_id": {"type": "int", "min": 10000, "max": 99999},
        "first_name": {"type": "string"},
        "last_name": {"type": "string"},
        "age": {"type": "int", "min": 18, "max": 100},
        "credit_score": {"type": "int", "min": 300, "max": 850},
    }

    rows = 10000
    data = await data_generator.generate_synthetic_data("customers", schema, rows)

    # Verify row count
    assert all(len(values) == rows for values in data.values())

    # Verify data constraints
    assert all(10000 <= x <= 99999 for x in data["customer_id"])
    assert all(18 <= x <= 100 for x in data["age"])
    assert all(300 <= x <= 850 for x in data["credit_score"])

    # Verify unique IDs
    assert len(set(data["customer_id"])) > rows * 0.95  # Allow for some duplicates due to random generation


@pytest.mark.asyncio
async def test_multiple_table_generation(data_generator):
    """Test generation of multiple related tables."""
    customers_schema = {
        "customer_id": {"type": "int", "min": 1, "max": 1000},
        "name": {"type": "string"},
    }

    policies_schema = {
        "policy_id": {"type": "int", "min": 1, "max": 2000},
        "customer_id": {"type": "int", "min": 1, "max": 1000, "correlated": True},
        "premium": {"type": "float", "min": 500.0, "max": 5000.0},
    }

    # Generate both tables
    customers = await data_generator.generate_synthetic_data("customers", customers_schema, 100)
    policies = await data_generator.generate_synthetic_data("policies", policies_schema, 200)

    # Verify referential integrity is maintained
    customer_ids = set(customers["customer_id"])
    policy_customer_ids = set(policies["customer_id"])

    # All policy customer_ids should exist in customers table
    assert policy_customer_ids.issubset(customer_ids)
