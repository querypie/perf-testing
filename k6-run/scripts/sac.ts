// @ts-ignore
import ssh from "k6/x/ssh";
// @ts-ignore
import { check, sleep } from "k6";
// @ts-ignore
import { Counter, Trend } from "k6/metrics";
// @ts-ignore
import querypie from "k6/x/querypie"; // ./init.go
// @ts-ignore
import arisa from "k6/x/arisa"; // ./init.go
import ExternalAPIClient from "./libs/externalAPI";

import { randomItem } from "./libs/utils";

// 트렌드 메트릭 정의
const connectTime = new Trend("ssh_connection_time");
const pwdCommandTime = new Trend("pwd_command_time");
const lsCommandTime = new Trend("ls_command_time");

// 카운터 메트릭 정의
const successCount = new Counter("ssh_connection_success");
const failureCount = new Counter("ssh_connection_failure");

const execCommandCount = new Counter("ssh_exec_command_count");

// @ts-ignore
const TEST = {
    scheme: __ENV.QUERYPIE_HOST_SCHEME,
    host: __ENV.QUERYPIE_HOST,
    arisa_host: __ENV.PROXY_HOST,

    ID: __ENV.QUERYPIE_USER,
    PW: __ENV.QUERYPIE_PASSWORD,

    role: __ENV.TEST_ROLE,
    server_group_name: __ENV.TEST_SERVER_GROUP,

    external_access_token: __ENV.EXTERNAL_ACCESS_TOKEN,
    wait_time_in_second: __ENV.WAIT_SECOND
}

let start, end, duration;
let access_token, access_token_expires_at, refresh_token, refresh_token_expires_at;
let conn;

function init() {
  start = 0;
  end = 0;
  duration = 0;
}

function wait() {
    sleep(TEST.wait_time_in_second)
}

export function setup() {
    console.log(TEST)

    const q = querypie(`${TEST.scheme}://${TEST.host}`);
    const auth = q.login(TEST.ID, TEST.PW);

    // default role 변경
    q.changeRole(TEST.role);

    // External API를 통해 접속할 타겟 서버 목록 조회
    // 아래 예시에선 그룹의 첫 번째 서버만 사용
    const e = new ExternalAPIClient(
        `${TEST.scheme}://${TEST.host}`,
        TEST.external_access_token
    );

    const servergroup = e.getServerGroupByName(TEST.server_group_name);
    const servers = e.listServersInGroup(servergroup.uuid);
    const account = e.listAccountsInServerGroup(servergroup.uuid)[0];

    const server_group_uuid = servergroup.uuid;
    const account_uuid = account.uuid;
    const account_name = account.name;

    const data = {
        host: TEST.arisa_host,
        port: "9000",
        agent_secret: auth.jwt_secret,

        username: TEST.ID,

        target_type: 6,
        target_uuids: servers.map((s) => s.uuid),
        server_group_uuid: server_group_uuid,
        account_uuid: account_uuid,
        account_name: account_name,

        access_token: auth.access_token,
        access_token_expires_at: auth.access_token_expires_at,
        refresh_token: auth.refresh_token,
        refresh_token_expires_at: auth.refresh_token_expires_at,
    }

    console.log(data)
    return data;
}

export default function (data) {
    try {
        if (!conn) {
            if(access_token) {
                const q = querypie(`${TEST.scheme}://${TEST.host}`);
                [access_token, access_token_expires_at] = q.refreshToken(access_token, refresh_token, access_token_expires_at, refresh_token_expires_at)
            }
            else {
                access_token = data.access_token
                access_token_expires_at = data.access_token_expires_at
                refresh_token = data.refresh_token
                refresh_token_expires_at = data.refresh_token_expires_at
            }
            conn = connect(data)
            wait()
        }

        // 명령어 실행 속도 측정 (pwd)
        start = new Date(); // pwd 명령어 시작 시간
        conn.command("pwd");
        end = new Date(); // pwd 명령어 완료 시간
        duration = end - start; // 걸린 시간 계산
        pwdCommandTime.add(duration); // 메트릭에 추가
        execCommandCount.add(1);      // Command 실행 카운트
        init(); // 초기화
        wait()

        // 명령어 실행 속도 측정 (ls)
        start = new Date(); // date 명령어 시작 시간
        conn.command("ls");
        end = new Date(); // date 명령어 완료 시간
        duration = end - start; // 걸린 시간 계산
        lsCommandTime.add(duration); // 메트릭에 추가
        execCommandCount.add(1);      // Command 실행 카운트
        init(); // 초기화
        wait()
    } catch (error) {
        // 연결 실패 카운트
        failureCount.add(1);
        console.error(`Error during SSH operations: ${error}`);
    }
}

export function teardown() {
    if (conn) {
        conn.close();
    }
}

function connect(data) {
    data.access_token = access_token
    data.target_uuid = randomItem(data.target_uuids)

    // SSH 연결 속도 측정
    start = new Date(); // 연결 시작 시간
    const conn = arisa(data)
    end = new Date(); // 연결 완료 시간
    duration = end - start; // 걸린 시간 계산 (밀리초 단위)
    connectTime.add(duration); // 메트릭에 추가
    init(); // 초기화

    // 연결 성공 카운트
    successCount.add(1);

    return conn
}
