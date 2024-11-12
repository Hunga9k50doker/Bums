const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const { DateTime } = require("luxon");
const md5 = require("md5");
const { HttpsProxyAgent } = require("https-proxy-agent");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, updateEnv } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

class Bums {
  constructor(queryId, accountIndex, proxy) {
    this.baseUrl = "https://api.bums.bot";
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en",
      "Content-Type": "multipart/form-data",
      Origin: "https://app.bums.bot",
      Referer: "https://app.bums.bot/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
    };
    this.SECRET_KEY = "7be2a16a82054ee58398c5edb7ac4a5a";
    this.tokenPath = path.join(__dirname, "token.json");
    this.loadProxies();
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    // this.wallets = this.loadWallets();
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127"`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  loadWallets() {
    try {
      const walletFile = path.join(__dirname, "wallets.txt");
      if (fs.existsSync(walletFile)) {
        return fs.readFileSync(walletFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
      }
      return [];
    } catch (error) {
      this.log(`Lỗi khi đọc file wallet: ${error.message}`, "error");
      return [];
    }
  }

  createUserAgent() {
    try {
      const telegramauth = this.queryId;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      // console.error("URI Error:", error.message);
      this.log(`Không để decode query_id, vui lòng lấy lại query id`, "warning");
    }
  }

  log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case "success":
        console.log(`[${timestamp}][Tài khoản ${this.accountIndex + 1}] [✓] ${msg}`.green);
        break;
      case "custom":
        console.log(`[${timestamp}][Tài khoản ${this.accountIndex + 1}] [*] ${msg}`.magenta);
        break;
      case "error":
        console.log(`[${timestamp}][Tài khoản ${this.accountIndex + 1}] [✗] ${msg}`.red);
        break;
      case "warning":
        console.log(`[${timestamp}][Tài khoản ${this.accountIndex + 1}] [!] ${msg}`.yellow);
        break;
      default:
        console.log(`[${timestamp}][Tài khoản ${this.accountIndex + 1}] [ℹ] ${msg}`.blue);
    }
  }

  async countdown(seconds) {
    for (let i = seconds; i > 0; i--) {
      const timestamp = new Date().toLocaleTimeString();
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`[*] Chờ ${i} giây để tiếp tục...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }

  loadProxies() {
    try {
      const proxyFile = path.join(__dirname, "proxy.txt");
      if (fs.existsSync(proxyFile)) {
        this.proxies = fs.readFileSync(proxyFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
      } else {
        this.proxies = [];
        this.log("Không tìm thấy file proxy.txt!", "warning");
      }
    } catch (error) {
      this.proxies = [];
      this.log(`Lỗi khi đọc file proxy: ${error.message}`, "error");
    }
  }

  async makeRequest(config, proxyUrl) {
    let retries = 0;
    let response = null;
    try {
      if (proxyUrl) {
        const proxyAgent = new HttpsProxyAgent(proxyUrl);
        config.httpsAgent = proxyAgent;
        config.proxy = false;
      }
      response = await axios(config);
      if (response.status !== 200 && retries == 0) {
        this.log(`Lỗi call API...đang thử lại...`);
        await sleep(3);
        retries++;
        response = await axios(config);
      }
      return response;
    } catch (error) {
      if (error.message?.includes("connect ECONNREFUSED")) {
        this.log(`Kết nối không thành công! Kiểm tra lại proxy: ${error.message}`);
        process.exit(1);
      }
      if (error.status == 401 && retries == 0) {
        this.log(`Lỗi không thể xác thực...đang lấy token mới...`);
        const loginResult = await this.login(this.queryId, "DTJy3oTR", proxyUrl);
        if (!loginResult.success) {
          this.log(`Đăng nhập không thành công, cần lấy lại query_id`, "error");
          process.exit(1);
        }
        this.saveToken(this.session_name, loginResult.token);
        retries++;
        response = await axios(config);
        return response;
      }
      throw error;
    }
  }

  async checkProxyIP(proxy) {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);
      const response = await axios.get("https://api.ipify.org?format=json", {
        httpsAgent: proxyAgent,
        proxy: false,
        timeout: 10000,
      });

      if (response.status === 200) {
        return response.data.ip;
      } else {
        throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error khi kiểm tra IP của proxy: ${error.message}`);
    }
  }

  async getGameInfo(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user_game_level/getGameInfo`;
    const headers = { ...this.headers, Authorization: `Bearer ${token}` };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          data: {
            blumInvitationCode: "",
          },
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          coin: response.data.data.gameInfo.coin,
          energySurplus: response.data.data.gameInfo.energySurplus,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  generateHashCode(collectAmount, collectSeqNo) {
    const data = `${collectAmount}${collectSeqNo}${this.SECRET_KEY}`;
    return md5(data);
  }

  distributeEnergy(totalEnergy) {
    const parts = 10;
    let remaining = parseInt(totalEnergy);
    const distributions = [];

    for (let i = 0; i < parts; i++) {
      const isLast = i === parts - 1;
      if (isLast) {
        distributions.push(remaining);
      } else {
        const maxAmount = Math.min(300, Math.floor(remaining / 2));
        const amount = Math.floor(Math.random() * maxAmount) + 1;
        distributions.push(amount);
        remaining -= amount;
      }
    }

    return distributions;
  }

  async collectCoins(token, collectSeqNo, collectAmount, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user_game/collectCoin`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const hashCode = this.generateHashCode(collectAmount, collectSeqNo);
    const formData = new FormData();
    formData.append("hashCode", hashCode);
    formData.append("collectSeqNo", collectSeqNo.toString());
    formData.append("collectAmount", collectAmount.toString());

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          newCollectSeqNo: response.data.data.collectSeqNo,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getTaskLists(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/task/lists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
          params: {
            _t: Date.now(),
          },
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          tasks: response.data.data.lists.filter((task) => task.isFinish === 0),
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getBoxFree(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/prop_shop/Lists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
          params: {
            showPages: "spin",
            page: 1,
            pageSize: 10,
          },
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        const data = response.data.data.find((box) => box.propId == "500010001" && !box.toDayUse);
        if (data) {
          const res = await this.createBoxFree(
            token,
            {
              num: data.sellLists[0].id,
              propShopSellId: data.sellLists[0]?.limitSingleBuyNumMin || 1,
            },
            proxyUrl
          );
          if (res.data?.code == 0) {
            this.log("Nhận box miễn phí thành công!", "success");
          }
        }
        return {
          success: true,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createBoxFree(token, params, proxyUrl) {
    const { num, propShopSellId } = params;
    const url = `${this.baseUrl}/miniapps/api/prop_shop/CreateGptPayOrder`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("num", num);
    formData.append("propShopSellId", propShopSellId);
    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          data: "ok",
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async finishTask(token, taskId, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/task/finish_task`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const params = new URLSearchParams();
    params.append("id", taskId.toString());
    params.append("_t", Date.now().toString());

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: params,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMineList(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine/getMineLists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          mines: response.data.data.lists,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async upgradeMine(token, mineId, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine/upgrade`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("mineId", mineId.toString());

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async upgradeTap(token, type, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user_game_level/upgradeLeve`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("type", type);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getDailyComboReward(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine_active/getMineAcctiveInfo`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async dailyCombo(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/mine_active/JoinMineAcctive`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("cardIdStr", `${settings.CARD_COMBO[0]},${settings.CARD_COMBO[1]},${settings.CARD_COMBO[2]}`);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );
      if (response.status === 200 && response.data.code === 0) {
        this.log("Nhận phần thưởng combo daily: 2,000,000", "success");
        return { success: true };
      } else {
        this.log("Lỗi nhận phần thưởng combo daily: " + response.data.msg, "warning");
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      this.log("Lỗi nhận phần thưởng combo daily: " + error.message, "error");
      return { success: false, error: error.message };
    }
  }

  async processTasks(token, proxyUrl) {
    this.log("Đang lấy danh sách nhiệm vụ...", "info");
    const taskList = await this.getTaskLists(token, proxyUrl);

    if (!taskList.success) {
      this.log(`Không thể lấy danh sách nhiệm vụ: ${taskList.error}`, "warning");
      return;
    }

    if (taskList.tasks.length === 0) {
      this.log("Không có nhiệm vụ mới!", "warning");
      return;
    }
    const tasks = taskList.tasks.filter((task) => !task.name.includes("Find hidden code") && !settings.SKIP_TASKS.includes(task.id));
    for (const task of tasks) {
      this.log(`Đang thực hiện nhiệm vụ: ${task.name}`, "info");
      const result = await this.finishTask(token, task.id, proxyUrl);

      if (result.success) {
        this.log(`Làm nhiệm vụ ${task.name} thành công | Phần thưởng: ${task.rewardParty}`, "success");
      } else {
        this.log(`Không thể hoàn thành nhiệm vụ ${task.id} | ${task.name}: chưa đủ điều kiện hoặc cần tự làm`, "warning");
      }

      await sleep(5);
    }
  }

  async processEnergyCollection(token, energy, initialCollectSeqNo, proxyUrl) {
    const energyDistributions = this.distributeEnergy(energy);
    let currentCollectSeqNo = initialCollectSeqNo;
    let totalCollected = 0;

    for (let i = 0; i < energyDistributions.length; i++) {
      const amount = energyDistributions[i];
      this.log(`Thu thập lần ${i + 1}/10: ${amount} năng lượng`, "custom");

      const result = await this.collectCoins(token, currentCollectSeqNo, amount, proxyUrl);

      if (result.success) {
        totalCollected += amount;
        currentCollectSeqNo = result.newCollectSeqNo;
        this.log(`Thành công! Đã thu thập: ${totalCollected}/${energy}`, "success");
      } else {
        this.log(`Lỗi khi thu thập: ${result.error}`, "error");
        break;
      }

      if (i < energyDistributions.length - 1) {
        await sleep(5);
      }
    }

    return totalCollected;
  }

  async processMineUpgrades(token, currentCoin, proxyUrl) {
    this.log("Đang lấy danh sách thẻ...", "info");
    const mineList = await this.getMineList(token, proxyUrl);

    if (!mineList.success) {
      this.log(`Không thể lấy danh sách thẻ: ${mineList.error}`, "error");
      return;
    }

    let availableMines = mineList.mines
      .filter((mine) => mine.status === 1 && parseInt(mine.nextLevelCost) <= Math.min(currentCoin, settings.MAX_COST_UPGRADE))
      .sort((a, b) => parseInt(b.nextPerHourReward) - parseInt(a.nextPerHourReward));

    if (availableMines.length === 0) {
      this.log("Không có thẻ nào có thể nâng cấp!", "warning");
      return;
    }

    let remainingCoin = currentCoin;
    for (const mine of availableMines) {
      const cost = parseInt(mine.nextLevelCost);
      if (cost > remainingCoin) continue;

      this.log(`Đang nâng cấp thẻ ID ${mine.mineId} | Cost: ${cost} | Reward/h: ${mine.nextPerHourReward}`, "info");
      const result = await this.upgradeMine(token, mine.mineId, proxyUrl);

      if (result.success) {
        remainingCoin -= cost;
        this.log(`Nâng cấp thẻ ID ${mine.mineId} thành công | Remaining coin: ${remainingCoin}`, "success");
      } else {
        this.log(`Không thể nâng cấp thẻ ID ${mine.mineId}: ${result.error}`, "error");
        if (result.error?.includes("Insufficient balance")) {
          const gameInfo = await this.getGameInfo(token, proxyUrl);
          if (gameInfo.success) remainingCoin = gameInfo.coin;
        }
      }

      await sleep(5);
    }
    await sleep(3);
    await this.processMineUpgrades(token, remainingCoin, proxyUrl);
  }

  async processTapUpgrades(token, data, proxyUrl) {
    const tapInfo = data.tapInfo;
    let currentCoin = data.gameInfo.coin;
    const types = ["bonusChance", "tap", "recovery", "energy", "collectInfo", "bonusRatio"];

    const listType = types.filter((type) => {
      if (+tapInfo[type]?.nextCostCoin <= Math.min(currentCoin, settings.MAX_COST_UPGRADE) && +tapInfo[type]?.level <= +settings.MAX_LEVEL_TAP_UPGRADE) return type;
    });
    if (listType.length == 0) {
      return;
    }
    for (const type of listType) {
      if (+tapInfo[type]?.nextCostCoin > currentCoin) continue;

      this.log(`Đang nâng cấp ${type} | Cost: ${tapInfo[type]?.nextCostCoin} | Next level: ${tapInfo[type]?.level + 1}`, "info");
      const result = await this.upgradeTap(token, type, proxyUrl);
      if (result.success) {
        currentCoin -= +tapInfo[type]?.nextCostCoin;
        this.log(`Nâng cấp ${type} thành công lên level ${tapInfo[type]?.level + 1}`, "success");
      } else {
        this.log(`Không thể nâng cấp ${type}: ${result.error}`, "error");
      }
      await sleep(3);
    }

    await sleep(3);
    const gameInfo = await this.getGameInfo(token, proxyUrl);
    if (gameInfo.success) {
      await this.processTapUpgrades(token, gameInfo.data, proxyUrl);
    }
  }

  async getSignLists(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/sign/getSignLists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await this.makeRequest(
        {
          method: "GET",
          url,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          lists: response.data.data.lists,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sign(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/sign/sign`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processSignIn(token, proxyUrl) {
    this.log("Đang kiểm tra điểm danh...", "info");
    const signList = await this.getSignLists(token, proxyUrl);

    if (!signList.success) {
      this.log(`Không thể lấy thông tin điểm danh: ${signList.error}`, "error");
      return;
    }

    const availableDay = signList.lists.find((day) => day.status === 0);
    if (!availableDay) {
      this.log("Không có ngày nào cần điểm danh!", "warning");
      return;
    }

    this.log(`Đang điểm danh ngày ${availableDay.days}...`, "info");
    const result = await this.sign(token, proxyUrl);

    if (result.success) {
      this.log(`Điểm danh ngày ${availableDay.days} thành công | Phần thưởng: ${availableDay.normal}`, "success");
    } else {
      this.log(`Điểm danh thất bại: ${result.error}`, "error");
    }

    await sleep(5);
  }

  async getGangLists(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/gang/gang_lists`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("boostNum", "15");
    formData.append("powerNum", "35");

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          myGang: response.data.data.myGang,
          gangLists: response.data.data.lists,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async joinGang(token, gangName = "airdrophuntersieutoc", proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/gang/gang_join`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    };

    const formData = new FormData();
    formData.append("name", gangName);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async lGang(token, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/gang/gang_leave`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
    };
    try {
      const response = await axios.get(url, formData, { headers }, proxyUrl);
      if (response.status === 200 && response.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processGangJoin(token, proxyUrl) {
    this.log("Đang kiểm tra thông tin gang...", "info");
    const gangList = await this.getGangLists(token, proxyUrl);

    if (!gangList.success) {
      this.log(`Không thể lấy thông tin gang: ${gangList.error}`, "warning");
      return;
    }

    if (!gangList.myGang.gangId) {
      const result = await this.joinGang(token, "airdrophuntersieutoc", proxyUrl);
      if (result.success) {
        this.log("Bạn đã gia nhập Gang thành công!", "success");
      } else {
        this.log(`Không thể gia nhập gang: ${result.error}`, "error");
      }
    } else if (gangList.myGang.gangId !== "1855185246600736769") {
      const res = await this.lGang(token, proxyUrl);
      if (res.success) {
        await this.joinGang(token, "airdrophuntersieutoc", proxyUrl);
      }
    }

    await sleep(5);
  }

  async login(initData, invitationCode, proxyUrl) {
    const url = `${this.baseUrl}/miniapps/api/user/telegram_auth`;
    const formData = new FormData();
    formData.append("invitationCode", invitationCode);
    formData.append("initData", initData);

    try {
      const response = await this.makeRequest(
        {
          method: "POST",
          url,
          data: formData,
          headers: this.headers,
        },
        proxyUrl
      );

      if (response.status === 200 && response.data.code === 0) {
        return {
          success: true,
          token: response.data.data.token,
          data: response.data.data,
        };
      } else {
        return { success: false, error: response.data.msg };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  saveToken(userId, token) {
    let tokens = {};
    if (fs.existsSync(this.tokenPath)) {
      tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf8"));
    }
    tokens[userId] = token;
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
  }

  getToken(userId) {
    if (fs.existsSync(this.tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf8"));
      return tokens[userId] || null;
    }
    return null;
  }

  isExpired(token) {
    const [header, payload, sign] = token.split(".");
    const decodedPayload = Buffer.from(payload, "base64").toString();

    try {
      const parsedPayload = JSON.parse(decodedPayload);
      const now = Math.floor(DateTime.now().toSeconds());

      if (parsedPayload.exp) {
        const expirationDate = DateTime.fromSeconds(parsedPayload.exp).toLocal();
        this.log(`Token hết hạn vào: ${expirationDate.toFormat("yyyy-MM-dd HH:mm:ss")}`, "custom");

        const isExpired = now > parsedPayload.exp;
        this.log(`Token đã hết hạn chưa? ${isExpired ? "Đúng rồi bạn cần thay token" : "Chưa..chạy tẹt ga đi"}`, "custom");

        return isExpired;
      } else {
        this.log(`Token vĩnh cửu không đọc được thời gian hết hạn`, "warning");
        return false;
      }
    } catch (error) {
      this.log(`Lỗi rồi: ${error.message}`, "error");
      return true;
    }
  }

  async runAccount() {
    const initData = this.queryId;
    const currentProxy = this.proxy || null;
    let proxyIP = "No proxy";

    try {
      if (currentProxy) {
        try {
          proxyIP = await this.checkProxyIP(currentProxy);
        } catch (error) {
          this.log(`Lỗi kiểm tra proxy: ${error.message}`, "warning");
          proxyIP = "Error checking IP";
        }
      }

      const i = this.accountIndex;
      const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
      const userId = userData.id;
      const firstName = userData.first_name || "";
      const lastName = userData.last_name || "";
      this.session_name = userId;
      const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
      console.log(`========== Tài khoản ${i + 1} | ${firstName + " " + lastName} | ip: ${proxyIP} | Bắt đầu sau ${timesleep} giây...==========`.magenta);
      this.set_headers();
      await sleep(timesleep);
      let token = this.getToken(userId);
      let needsNewToken = !token || this.isExpired(token);

      if (needsNewToken) {
        this.log(`Đang đăng nhập...`, "info");
        const loginResult = await this.login(initData, "DTJy3oTR", currentProxy);

        if (!loginResult.success) {
          this.log(`Đăng nhập không thành công, cần lấy lại query_id: ${loginResult.error}`, "error");
          return;
        }

        token = loginResult.token;
        this.saveToken(userId, token);
        this.log("Đăng nhập thành công!", "success");
      } else {
        this.log("Sử dụng token hiện có...", "info");
      }
      await sleep(5);
      await this.processSignIn(token, currentProxy);
      await sleep(5);
      await this.getBoxFree(token, currentProxy);

      if (settings.DAILY_COMBO) {
        await sleep(5);
        const res = await this.getDailyComboReward(token, currentProxy);
        if (res?.data?.resultNum == 0) this.log(`Bạn đã nhận combodaily!`, "warning");
        else await this.dailyCombo(token, currentProxy);
      }

      if (settings.AUTO_JOIN_GANG) {
        await sleep(5);
        await this.processGangJoin(token, currentProxy);
      }

      if (settings.AUTO_TASK) {
        await sleep(5);
        await this.processTasks(token, currentProxy);
      }

      await sleep(5);
      const gameInfo = await this.getGameInfo(token, currentProxy);
      if (gameInfo.success) {
        this.log(`Coin: ${gameInfo.coin}`, "custom");
        this.log(`Energy: ${gameInfo.energySurplus}`, "custom");
        if (settings.AUTO_TAP) {
          if (parseInt(gameInfo.energySurplus) > 0) {
            this.log(`Bắt đầu thu thập năng lượng...`, "info");
            const collectSeqNo = gameInfo.data.tapInfo.collectInfo.collectSeqNo;
            await this.processEnergyCollection(token, gameInfo.energySurplus, collectSeqNo, currentProxy);
          } else {
            this.log(`Không đủ năng lượng để thu thập`, "warning");
          }
        }
        if (settings.AUTO_UPGRADE_TAP) {
          await sleep(5);
          await this.processTapUpgrades(token, gameInfo.data, currentProxy);
        }

        if (settings.AUTO_UPGRADE) {
          await sleep(5);
          await this.processMineUpgrades(token, parseInt(gameInfo.coin), currentProxy);
        }
      } else {
        this.log(`Không thể lấy thông tin game: ${gameInfo.error}`, "warning");
      }
    } catch (error) {
      this.log(`Lỗi xử lý tài khoản: ${error.message}`, "error");
      return;
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy } = workerData;
  const to = new Bums(queryId, accountIndex, proxy);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");
  // const agents = #load_session_data();
  // const wallets = loadData("wallets.txt");

  if (queryIds.length > proxies.length) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
  let maxThreads = settings.MAX_THEADS;

  queryIds.map((val, i) => new Bums(val, i, proxies[i]).createUserAgent());

  sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message.error) {
                errors.push(`Tài khoản ${message.accountIndex}: ${message.error}`);
              }
              //   console.log(`Tài khoản ${message.accountIndex}: ${message.error}`);
              resolve();
            });
            worker.on("error", (error) => {
              errors.push(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              //   console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              resolve();
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    const to = new Bums(null, 0, proxies[0]);
    await sleep(3);
    updateEnv("DAILY_COMBO", "false");
    await sleep(5);
    console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
    console.log(`=============Hoàn thành tất cả tài khoản=============`.magenta);
    await to.countdown(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
