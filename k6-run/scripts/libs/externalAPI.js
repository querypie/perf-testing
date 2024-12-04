import { check } from "k6";
import { get } from "k6/http";
import { randomItem } from "./utils";

export default class ExternalAPIClient {
    /**
     * @param {string} baseURL
     * @param {string} externalAPIToken
     */
    constructor(baseURL, externalAPIToken) {
        this.baseURL = baseURL;
        this.token = externalAPIToken;
    }

    getServerGroupByName(name) {
        const res = get(
            `${this.baseURL}/api/external/v2/sac/server-groups?pageSize=99999`,
            {
                headers: { Authorization: `Bearer ${this.token}` },
            }
        );

        try {
            /**
             * @type {serverGroupListResponse}
             */
            const data = res.json();
            const result = data.list.filter((group) => group.name === name);
            check(result.length, { "Server Group exists": (val) => val == 1 });
            return result[0];
        } catch (e) {
            throw new Error(`Failed to get server group by name: ${res.body}`);
        }
    }

    /**
     * @param {string} serverGroupUUID
     */
    listServersInGroup(serverGroupUUID) {
        const res = get(
            `${this.baseURL}/api/external/v2/sac/server-groups/${serverGroupUUID}/servers`,
            { headers: { Authorization: `Bearer ${this.token}` } }
        );

        try {
            /**
             * @type {serversInGroupResponse}
             */
            const data = res.json();
            check(data.list.length, { "Servers are exist": (val) => val > 0 });
            return data.list;
        } catch (e) {
            throw new Error(`Failed to get server list: ${res.body}`);
        }
    }

    listAccountsInServerGroup(serverGroupUUID) {
        const res = get(
            `${this.baseURL}/api/external/v2/sac/server-groups/${serverGroupUUID}/accounts`,
            { headers: { Authorization: `Bearer ${this.token}` } }
        );

        try {
            /**
             * @type {Account[]}
             */
            const data = res.json().list;
            check(data.length, { "Accounts are exist": (val) => val > 0 });
            return data;
        } catch (e) {
            throw new Error(`Failed to get accounts: ${res.body}`);
        }
    }
}

/**
 * @param {string} url
 * @param {string} externalAccessToken
 * @param {string} serverGroupName
 * @returns {import("./webSocketSSH").serverConnectionInfo}
 */
export function prepareServerConnectionInfo(
    url,
    externalAccessToken,
    serverGroupName
) {
    const c = new ExternalAPIClient(url, externalAccessToken);
    const sg = c.getServerGroupByName(serverGroupName);
    const servers = c.listServersInGroup(sg.uuid);
    const account = c.listAccountsInServerGroup(sg.uuid)[0];
    return {
        serverUuid: randomItem(servers).uuid,
        serverGroupUuid: sg.uuid,
        accountName: account.auth.accountId,
        accountUuid: account.uuid,
    };
}

/** @typedef {object} serverGroupListResponse
 * @property {object[]} list
 * @property {string} list.createdAt
 * @property {string} list.description
 * @property {object[]} list.filterTags
 * @property {string} list.filterTags.key
 * @property {string} list.filterTags.operator
 * @property {string} list.filterTags.value
 * @property {string} list.name
 * @property {string} list.updatedAt
 * @property {string} list.uuid
 * @property {object} page
 * @property {number} page.currentPage
 * @property {number} page.pageSize
 * @property {number} page.totalElements
 * @property {number} page.totalPages
 */

/** @typedef {object} serversInGroupResponse
 * @property {object[]} list
 * @property {string} list.host
 * @property {string} list.name
 * @property {string} list.osType
 * @property {object} list.tags
 * @property {object[]} list.tags.customTags
 * @property {string} list.tags.customTags.key
 * @property {string} list.tags.customTags.value
 * @property {object[]} list.tags.providerTags
 * @property {string} list.tags.providerTags.key
 * @property {string} list.tags.providerTags.value
 * @property {string} list.uuid
 * @property {object} page
 * @property {number} page.currentPage
 * @property {number} page.pageSize
 * @property {number} page.totalElements
 * @property {number} page.totalPages
 */

/** @typedef {object} Account
 * @property {string} accountType
 * @property {object} auth
 * @property {string} auth.accountId
 * @property {string} auth.authType
 * @property {boolean} sftpEnabled
 * @property {boolean} sshEnabled
 * @property {string} uuid
 * @property {string} name
 */