FROM python:3.10-slim

# Install system dependencies for GDAL/Fiona and GeoPandas
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Fiona needs to know where GDAL is
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Produkční nastavení (bez reload)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]