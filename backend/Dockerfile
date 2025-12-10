# Use an official Python runtime as a parent image
# Slim version is used to keep the image size small
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies required for GeoPandas and PostgreSQL adapter
# libpq-dev is needed for psycopg2, gcc for compiling C extensions
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install Python dependencies
# --no-cache-dir reduces image size
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose port 8000 for FastAPI
EXPOSE 8000

# Command to run the application using Uvicorn
# --host 0.0.0.0 makes the server accessible externally (outside the container)
# --reload enables hot-reloading for development
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]