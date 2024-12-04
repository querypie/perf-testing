import ws, { Socket } from "k6/ws";
import { fail } from "k6";
import { Counter, Trend } from "k6/metrics";

const NewSessionCounter = new Counter("new_session_counter");

const CommandCounter = new Counter("command_counter");
const CommandRTT = new Trend("command_rtt", true);
const SocketErrorCounter = new Counter("socket_error_counter");
const SocketSuccessCounter = new Counter("socket_success_counter");
const SocketClosedCounter = new Counter("socket_closed_counter");

let lastCommand = "";
let lastMessageSent = new Date();
let flag = false;

/**
 * @typedef {Object} serverConnectionInfo
 * @property {string} serverUuid
 * @property {string} serverGroupUuid
 * @property {string} accountName
 * @property {string} accountUuid
 */

/**
 * @param {string} url
 * @param {string} accessToken
 * @param {serverConnectionInfo} connInfo
 * @param {function(Socket)} scenario
 * @param {number} closedAfter
 * @returns
 */
export default function connectWebSocketSSH(
    url,
    accessToken,
    connInfo,
    scenario,
    closedAfter = 600_000
) {
    return ws.connect(
        url,
        { headers: { Cookie: `access_token=${accessToken}` } },
        function (socket) {
            socket.on("open", () => {
                flag = true;
                lastMessageSent = new Date();
                lastCommand = "#CONNECT#";
                socket.send(
                    JSON.stringify({
                        type: "CONNECT",
                        body: {
                            accessToken: accessToken,
                            type: "Ssh",
                            ...connInfo,
                        },
                    })
                );
            });
            socket.on("close", () => {
                console.log("WebSocket Closed");
            });
            socket.on("error", (e) => {
                SocketErrorCounter.add(1);
                socket.close();
                fail("WebSocket error: " + e);
            });
            socket.on("message", (data) => {
                const d = JSON.parse(data);
                switch (d.type) {
                    case "CONNECT":
                        NewSessionCounter.add(1);
                        console.log({
                            type: "CONNECT",
                            sessionId: d.body.sessionId,
                        });
                        break;
                    case "MESSAGE":
                        const rtt = new Date() - lastMessageSent;
                        if (flag) {
                            CommandCounter.add(1, { command: lastCommand });
                            CommandRTT.add(rtt, { command: lastCommand });
                            console.log({
                                command: lastCommand,
                                rtt: rtt,
                            });
                        }
                        flag = false;
                        console.log({
                            type: "MESSAGE",
                            data: d.body.message.slice(0, 10) + "...",
                        });
                        break;
                    case "CLOSE":
                        console.log("CLOSE: ", d);
                        SocketClosedCounter.add(1, {
                            code: d.body.code,
                            reason: d.body.reason,
                        });
                        socket.close();
                        break;
                    default:
                        console.log("Unknown message: ", d);
                        SocketClosedCounter.add(1, {
                            code: "-1",
                            reason: "Unknown message",
                        });
                        socket.close();
                }
            });
            socket.setTimeout(() => {
                SocketSuccessCounter.add(1);
                socket.close();
            }, closedAfter);
            scenario(socket);
        }
    );
}

/**
 * @param {Socket} socket
 * @param {string} command
 */
export function sendCommand(socket, command) {
    flag = true;
    lastCommand = command;
    lastMessageSent = new Date();
    socket.send(
        JSON.stringify({
            type: "MESSAGE",
            body: { message: command + "\r" },
        })
    );
}