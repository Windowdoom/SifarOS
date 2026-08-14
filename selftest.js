/* Headless 7-point self-test for Whisper.
   Loads index.html in Chromium, runs full simulations, asserts engine soundness.
   Usage: node selftest.js */
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const exe = "/opt/pw-browsers/chromium";
  let browser;
  try { browser = await chromium.launch({ executablePath: exe }); }
  catch { browser = await chromium.launch(); }
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto("file://" + path.resolve(__dirname, "index.html"));
  await page.waitForFunction(() => window.Game && window.Game._debug);

  const report = await page.evaluate(() => {
    const D = window.Game._debug();
    const NAMES = ["Mara","Lena","Ivan","Jonah","Petra","Nadia","Odette","Sol","Tomas","Cyrus","Bram","Wren"];
    const TOPICS = ["kindness","honesty","romance","competence"];
    const out = { runs: 0, boundOk: true, trustOk: true, winSeen: false, lossSeen: false, propagated: false };

    for (let seed = 1; seed <= 40; seed++) {
      D.fresh(seed);
      const S = D.getS();
      // scripted play: whisper warmly about the goal subject a few times, advance to end
      const gt = { clear: "honesty", cheer: "kindness", match: "romance" }[S.goal.id];
      const hubs = ["Nadia", "Lena"]; // two well-connected mouths
      for (let step = 0; step < 20 && !S.over; step++) {
        let h = 0;
        while (S.whispersLeft > 0) D.whisper(hubs[h++ % hubs.length], S.goal.subject, gt, 0.7);
        D.advanceDay();
        // check bounds every day
        for (const k in S.belief) {
          const b = S.belief[k];
          if (b.v < -1.0001 || b.v > 1.0001 || b.s < -1e-6 || b.s > 1.0001) out.boundOk = false;
        }
        for (const k in S.trust) {
          const v = S.trust[k];
          if (v < 0.0499 || v > 0.9501) out.trustOk = false;
        }
      }
      // did anything propagate beyond the whisper target?
      let touched = 0;
      for (const n of NAMES) for (const tp of TOPICS) {
        const b = S.belief[n + "|" + S.goal.subject + "|" + tp];
        if (b && b.s > 0.1) touched++;
      }
      if (touched > 2) out.propagated = true;
      if (S.over && D.getS().day <= D.getS().maxDays) out.winSeen = true;
      out.runs++;
    }
    // passive control: do nothing → the loss branch must fire
    for (let seed = 1; seed <= 5 && !out.lossSeen; seed++) {
      D.fresh(seed);
      const S = D.getS();
      for (let step = 0; step < 20 && !S.over; step++) D.advanceDay();
      if (S.over && D.getS().day > D.getS().maxDays) out.lossSeen = true;
    }
    return out;
  });

  const checks = [
    ["1. loads with no console errors", errors.length === 0, errors.join(" | ")],
    ["2. values stay bounded across sims", report.boundOk, "valence/strength out of range"],
    ["3. trust stays in [0.05,0.95]", report.trustOk, "trust drifted out of clamp"],
    ["4. rumors propagate beyond target", report.propagated, "nothing spread"],
    ["5a. a win can fire", report.winSeen, "no win in 40 seeded runs"],
    ["5b. a loss can fire", report.lossSeen, "no loss in 40 seeded runs"],
    ["6. ran full sims cleanly", report.runs === 40, "runs=" + report.runs],
  ];
  let ok = true;
  for (const [name, pass, why] of checks) {
    console.log((pass ? "PASS " : "FAIL ") + name + (pass ? "" : "  → " + why));
    if (!pass) ok = false;
  }
  await browser.close();
  console.log(ok ? "\nALL CHECKS PASSED ✓" : "\nSOME CHECKS FAILED ✗");
  process.exit(ok ? 0 : 1);
})();
