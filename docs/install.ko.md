# 소프트웨어 설치 가이드

인프라 구성([aws.ko.md](aws.ko.md))이 완료된 이후, 각 VM에 소프트웨어를 설치하는 방법을 안내합니다.

모든 VM에서 이 리포지토리를 git clone한 후, 역할에 맞는 `compose.yml`을 실행하는 방식으로 진행합니다.

---

## VM 역할 및 사용하는 compose 파일

| VM | 역할 | 사용하는 compose 파일 |
|----|------|----------------------|
| `perf-acp-app` | QueryPie ACP 서버 | (별도 설치 가이드 참고) |
| `perf-acp-db` | ACP용 MySQL + Redis | `acp-db/compose.yml` |
| `perf-monitor` | Prometheus + Grafana | `prometheus/compose.yml`<br>`grafana/compose.yml` |
| `perf-target1` | 테스트 대상 MySQL + SSH | `target/compose.yml` |
| `perf-target2` | 테스트 대상 MySQL + SSH | `target/compose.yml` |

> **node_exporter**: 모든 VM에서 `node-exporter/compose.yml`을 실행합니다.

---

## 환경 변수 설정

이후 모든 단계에서 아래 환경 변수를 사용합니다. 터미널을 새로 열 때마다 설정합니다.

```bash
export ACP_APP_PUBLIC=3.34.42.249
export ACP_DB_PUBLIC=54.180.249.31
export MONITOR_PUBLIC=13.209.14.140
export TARGET1_PUBLIC=43.201.34.153
export TARGET2_PUBLIC=43.203.128.130

export ACP_APP_PRIVATE=172.31.2.30
export ACP_DB_PRIVATE=172.31.10.31
export MONITOR_PRIVATE=172.31.15.179
export TARGET1_PRIVATE=172.31.11.239
export TARGET2_PRIVATE=172.31.7.106

export SSH_KEY=~/.ssh/perf-key.pem
export SSH_USER=ec2-user
export REPO=https://github.com/querypie/perf-testing.git
```

---

## 1. 공통 준비 (전체 VM)

### 1.1 Docker 설치

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

> `usermod` 적용은 SSH 재접속 후 반영됩니다.

#### 전체 VM 일괄 실행

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo "=== $HOST ==="
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST \
    "sudo dnf install -y docker && sudo systemctl enable --now docker && sudo usermod -aG docker ec2-user" 2>&1 | tail -2
done
```

#### 설치 확인

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo -n "$HOST: "
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST "docker --version" 2>/dev/null
done
```

### 1.2 Docker Compose 설치

Amazon Linux 2023 패키지에는 Docker Compose 플러그인이 포함되어 있지 않아 별도 설치가 필요합니다.

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -sL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

#### 전체 VM 일괄 실행

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo "=== $HOST ==="
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST "
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -sL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    docker compose version
  " 2>/dev/null
done
```

### 1.3 리포지토리 clone

```bash
sudo dnf install -y git
git clone https://github.com/querypie/perf-testing.git ~/perf-testing
```

#### 전체 VM 일괄 실행

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo "=== $HOST ==="
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST \
    "sudo dnf install -y git 2>/dev/null | tail -1 && git clone $REPO ~/perf-testing 2>&1 | tail -1"
done
```

### 1.4 node_exporter 실행

```bash
cd ~/perf-testing/node-exporter
docker compose up -d
```

#### 전체 VM 일괄 실행

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo "=== $HOST ==="
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST \
    "cd ~/perf-testing/node-exporter && sudo docker compose up -d" 2>/dev/null
done
```

#### 동작 확인

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo -n "$HOST :9100 → "
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST \
    "curl -s --max-time 3 http://localhost:9100/metrics | head -1" 2>/dev/null
done
```

---

## 2. perf-acp-db: MySQL + Redis 실행

```bash
ssh -i $SSH_KEY $SSH_USER@$ACP_DB_PUBLIC
```

```bash
cd ~/perf-testing/acp-db
docker compose up -d
```

#### 동작 확인

```bash
docker compose ps
docker exec mysql mysql -uquerypie -pquerypie -e "SELECT 1"
docker exec redis redis-cli ping
```

---

## 3. perf-target1, perf-target2: MySQL + SSH 설정

### MySQL 실행

perf-target1, perf-target2 각각에서 실행합니다.

```bash
cd ~/perf-testing/target
docker compose up -d
```

#### 동작 확인

```bash
docker compose ps
docker exec mysql mysql -utestuser -ptestpass -e "SELECT 1"
```

### SAC 테스트용 SSH 계정 생성

Amazon Linux 2023은 SSH 서버가 기본 설치되어 있습니다.
SAC 테스트용 OS 계정을 생성하고 패스워드 인증을 활성화합니다.

```bash
# 테스트용 OS 계정 생성
sudo useradd -m testuser
echo "testuser:testpass" | sudo chpasswd

# SSH 패스워드 인증 활성화 (SAC 프록시 경유 접속용)
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

#### 동작 확인

```bash
ssh testuser@localhost "echo SSH OK"
```

#### perf-target1, perf-target2 일괄 실행

```bash
for HOST in $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo "=== $HOST ==="
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST "
    cd ~/perf-testing/target && sudo docker compose up -d
    sudo useradd -m testuser 2>/dev/null
    echo 'testuser:testpass' | sudo chpasswd
    sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
    sudo systemctl restart sshd
  "
done
```

---

## 4. perf-monitor: Prometheus + Grafana 실행

### 4.1 prometheus.yml 설정

Prometheus가 수집할 node_exporter 대상 IP를 설정합니다.

```bash
ssh -i $SSH_KEY $SSH_USER@$MONITOR_PUBLIC
```

```bash
cd ~/perf-testing/prometheus
vi etc/prometheus/prometheus.yml
```

`node-exporters` 섹션의 targets에 각 VM의 **Private IP**를 입력합니다:

```yaml
  - job_name: 'node-exporters'
    static_configs:
      - targets:
          - '172.31.2.30:9100'   # perf-acp-app
          - '172.31.10.31:9100'  # perf-acp-db
          - '172.31.15.179:9100' # perf-monitor
          - '172.31.11.239:9100' # perf-target1
          - '172.31.7.106:9100'  # perf-target2
```

### 4.2 Prometheus 실행

```bash
cd ~/perf-testing/prometheus
docker compose up -d
```

#### 동작 확인

```bash
curl -s http://localhost:9090/-/ready
```

### 4.3 Grafana 실행

```bash
cd ~/perf-testing/grafana
docker compose up -d
```

#### 동작 확인

```bash
curl -s http://localhost:3000/api/health
```

Grafana 웹 UI: `http://<perf-monitor Public IP>:3000`
초기 계정: `admin` / `admin`

---

## 5. perf-acp-app: QueryPie ACP 설치

> QueryPie ACP 설치는 별도 설치 가이드를 참고하세요.

---

## 부록: 전체 설치 상태 확인

```bash
for HOST in $ACP_APP_PUBLIC $ACP_DB_PUBLIC $MONITOR_PUBLIC $TARGET1_PUBLIC $TARGET2_PUBLIC; do
  echo "=== $HOST ==="
  ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$HOST \
    "sudo docker ps --format 'table {{.Names}}\t{{.Status}}'" 2>/dev/null
  echo ""
done
```
