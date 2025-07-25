# Step 1: Use the custom k6 builder by Grafana Labs
# NOTE(JK): grafana/xk6 supports linux/amd64 platform only as of Aug 2024.
FROM grafana/xk6:latest AS builder

# Set the working directory
WORKDIR /build

# build a custom k6 binary
RUN xk6 build \
    --with github.com/grafana/xk6-output-prometheus-remote \
    --with github.com/grafana/xk6-sql \ 
    --with github.com/grafana/xk6-ssh 
RUN ls -al /build


# Step 2: Create a lightweight image to run the k6 binary
FROM alpine:3.22

# Set the working directory
WORKDIR /app

# Copy the built k6 binary from the builder stage
COPY --from=builder /build/k6 /usr/local/bin/k6

# Set the entrypoint to k6
ENTRYPOINT ["k6"]
