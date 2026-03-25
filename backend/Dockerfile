FROM python:3.12-alpine3.23

# GDAL + build tools needed for fiona/geopandas (shapefile export)
RUN apk add --no-cache \
    gcc g++ musl-dev \
    gdal-dev

# Tell fiona/geopandas where GDAL headers are (Alpine paths)
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

WORKDIR /app

# Install Python deps first — this layer is cached until requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only application code (see .dockerignore for exclusions)
COPY . .

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
