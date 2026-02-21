# AWS 네트워크 구성 가이드 (선택 사항)

기존 VPC와 서브넷이 있다면 이 문서는 건너뜁니다.
새로운 VPC와 서브넷을 처음부터 생성해야 하는 경우에만 이 가이드를 사용하세요.

완료 후 생성된 **VPC ID**와 **Subnet ID**를 메인 가이드의 3단계에 입력합니다.

---

## 1. VPC 생성

#### 콘솔 방법

1. AWS 콘솔 → **VPC** 서비스 이동
2. 좌측 메뉴 **Your VPCs** → **Create VPC** 클릭
3. 아래와 같이 입력:
   - **Resources to create**: `VPC only`
   - **Name tag**: `perf-vpc`
   - **IPv4 CIDR**: `10.0.0.0/16`
   - 나머지는 기본값 유지
4. **Create VPC** 클릭
5. 생성된 VPC의 **VPC ID** 메모

#### CLI 방법

```bash
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=perf-vpc}]" \
  --region $AWS_REGION \
  --query 'Vpc.VpcId' \
  --output text)

echo "VPC ID: $VPC_ID"

# DNS 호스트명 활성화
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames --region $AWS_REGION
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support --region $AWS_REGION
```

---

## 2. 서브넷 생성

#### 콘솔 방법

1. VPC 콘솔 → 좌측 **Subnets** → **Create subnet** 클릭
2. 아래와 같이 입력:
   - **VPC ID**: `perf-vpc` 선택
   - **Subnet name**: `perf-subnet`
   - **Availability Zone**: 사용하려는 리전의 가용 영역 선택 (예: `ap-northeast-2a`)
   - **IPv4 CIDR block**: `10.0.1.0/24`
3. **Create subnet** 클릭
4. 생성된 서브넷의 **Subnet ID** 메모
5. 생성된 서브넷 선택 → **Actions** → **Edit subnet settings**
   - **Enable auto-assign public IPv4 address** 체크 → **Save**

#### CLI 방법

```bash
SUBNET_ID=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone ${AWS_REGION}a \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=perf-subnet}]" \
  --region $AWS_REGION \
  --query 'Subnet.SubnetId' \
  --output text)

echo "Subnet ID: $SUBNET_ID"

# Public IP 자동 할당 활성화
aws ec2 modify-subnet-attribute \
  --subnet-id $SUBNET_ID \
  --map-public-ip-on-launch \
  --region $AWS_REGION
```

---

## 3. 인터넷 게이트웨이 생성 및 연결

#### 콘솔 방법

1. VPC 콘솔 → **Internet Gateways** → **Create internet gateway** 클릭
2. **Name tag**: `perf-igw` 입력 → **Create internet gateway** 클릭
3. 생성 후 **Actions** → **Attach to VPC** → `perf-vpc` 선택 → **Attach** 클릭

#### CLI 방법

```bash
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=perf-igw}]" \
  --region $AWS_REGION \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)

echo "IGW ID: $IGW_ID"

aws ec2 attach-internet-gateway \
  --internet-gateway-id $IGW_ID \
  --vpc-id $VPC_ID \
  --region $AWS_REGION
```

---

## 4. 라우팅 테이블 설정

#### 콘솔 방법

1. VPC 콘솔 → **Route Tables** → **Create route table** 클릭
2. **Name**: `perf-rtb`, **VPC**: `perf-vpc` 선택 → **Create** 클릭
3. 생성된 라우팅 테이블 선택 → **Routes** 탭 → **Edit routes**
   - **Add route**: Destination `0.0.0.0/0`, Target `perf-igw`
4. **Subnet associations** 탭 → **Edit subnet associations** → `perf-subnet` 체크

#### CLI 방법

```bash
RTB_ID=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=perf-rtb}]" \
  --region $AWS_REGION \
  --query 'RouteTable.RouteTableId' \
  --output text)

echo "Route Table ID: $RTB_ID"

aws ec2 create-route \
  --route-table-id $RTB_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID \
  --region $AWS_REGION

aws ec2 associate-route-table \
  --route-table-id $RTB_ID \
  --subnet-id $SUBNET_ID \
  --region $AWS_REGION
```

---

## 5. 결과 확인

```bash
echo "=== 생성된 네트워크 리소스 ==="
echo "VPC ID:    $VPC_ID"
echo "Subnet ID: $SUBNET_ID"
echo "IGW ID:    $IGW_ID"
echo "RTB ID:    $RTB_ID"
```

이 값들을 메인 가이드([aws.ko.md](aws.ko.md)) 3단계에 입력합니다.

---

## 정리 (삭제 순서)

네트워크 리소스는 인스턴스 종료 후 아래 순서로 삭제합니다.

```bash
aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $AWS_REGION
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID --region $AWS_REGION
aws ec2 delete-subnet --subnet-id $SUBNET_ID --region $AWS_REGION
aws ec2 delete-route-table --route-table-id $RTB_ID --region $AWS_REGION
aws ec2 delete-vpc --vpc-id $VPC_ID --region $AWS_REGION
```
