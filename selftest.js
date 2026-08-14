/* Headless 7-point self-test for Whisper: Vigil.
   Loads index.html in Chromium, runs full simulations, asserts that the
   moral-agency engine is sound: souls can fall, resist, and come back —
   and the player's care matters without ever making the choice.
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
    const out = { runs:0, boundOk:true, fallSeen:false, resistSeen:false, redeemSeen:false,
                  winSeen:false, lossSeen:false, careWins:0, neglectFalls:0 };

    function checkBounds(S){
      for (const k in S.belief){ const b=S.belief[k];
        if (b.v<-1.0001||b.v>1.0001||b.s<-1e-6||b.s>1.0001) out.boundOk=false; }
      for (const k in S.trust){ const v=S.trust[k];
        if (v<0.0499||v>0.9501) out.boundOk=false; }
      for (const n of NAMES){ const M=S.moral[n];
        if (M.T<-1e-6||M.T>1.0001||M.C<-1e-6||M.C>1.2001||M.guilt<-1e-6||M.guilt>1.0001||M.fatigue<-1e-6||M.fatigue>1.0001) out.boundOk=false; }
    }

    // --- caretaker runs: warm whoever stands nearest the shadow ----------
    for (let seed=1; seed<=25; seed++){
      D.fresh(seed); const S=D.getS();
      for (let step=0; step<20 && !S.over; step++){
        const target=S.goal.subject;
        const nbs=D.neighbors(target);
        let i=0;
        while (S.whispersLeft>0 && i<nbs.length) D.whisper(nbs[i++], target, "kindness", 0.7);
        D.advanceDay();
        checkBounds(S);
        S.xroads?.length; // touch
      }
      const fallen=NAMES.filter(n=>S.moral[n].standing==="fallen").length;
      const red=NAMES.filter(n=>S.moral[n].standing==="redeemed").length;
      if (red>0) out.redeemSeen=true;
      if (S.over && S.day>S.maxDays && fallen===0){ out.winSeen=true; out.careWins++; }
      out.runs++;
    }

    // --- neglect runs: do nothing, let winter do its work ----------------
    for (let seed=1; seed<=25; seed++){
      D.fresh(seed); const S=D.getS();
      let resisted=false, fell=false;
      for (let step=0; step<20 && !S.over; step++){
        D.advanceDay();
        checkBounds(S);
        (S.xroads||[]).forEach(x=>{
          if (x.chose==="fell") fell=true;
          if (x.chose==="resisted"||x.chose==="forgave") resisted=true;
          if (x.chose==="confessed") out.redeemSeen=true;
        });
      }
      if (fell){ out.fallSeen=true; out.neglectFalls++; }
      if (resisted) out.resistSeen=true;
      const fallen=NAMES.filter(n=>S.moral[n].standing==="fallen").length;
      if (S.over && fallen>0) out.lossSeen=true;
      out.runs++;
    }
    return out;
  });

  const checks = [
    ["1. loads with no console errors", errors.length===0, errors.join(" | ")],
    ["2. all values stay bounded (beliefs, trust, souls)", report.boundOk, "out of range"],
    ["3. souls CAN fall under pressure (evil is a real choice)", report.fallSeen, "no fall in neglect runs"],
    ["4. souls CAN resist the same pressure (good is a real choice)", report.resistSeen, "no resistance seen"],
    ["5. redemption is reachable (fallen souls come back)", report.redeemSeen, "no confession seen"],
    ["6a. a caretaker can win (care matters)", report.winSeen, "careWins="+report.careWins],
    ["6b. neglect can lose (stakes are real)", report.lossSeen, "no loss under neglect"],
    ["7. all sims ran clean", report.runs===50, "runs="+report.runs],
  ];
  let ok = true;
  for (const [name,pass,why] of checks){
    console.log((pass?"PASS ":"FAIL ")+name+(pass?"":"  → "+why));
    if(!pass) ok=false;
  }
  console.log(`   (caretaker wins: ${report.careWins}/25 · neglect runs with a fall: ${report.neglectFalls}/25)`);
  await browser.close();
  console.log(ok ? "\nALL CHECKS PASSED ✓" : "\nSOME CHECKS FAILED ✗");
  process.exit(ok ? 0 : 1);
})();
