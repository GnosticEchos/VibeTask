#!/bin/bash

DB_NAME="kanbanana"
OUTPUT_DIR="."
PG_HOST="localhost" # Or your PostgreSQL host
PG_PORT="5432"      # Or your PostgreSQL port
PG_USER="postgres" # Or your PostgreSQL username

mkdir -p "$OUTPUT_DIR"

TABLES=$(psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $DB_NAME -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';")

for TABLE in $TABLES; do
    echo "Dumping table: $TABLE"
    psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $DB_NAME -c "\copy (SELECT * FROM $TABLE) TO '$OUTPUT_DIR/$TABLE.csv' WITH CSV HEADER;"
done

echo "Data dump complete."
