/* Mortgage Tool – Olivier (v2) */
(() => {
  const $ = (id) => document.getElementById(id);
  const fmtEUR = new Intl.NumberFormat('fr-BE', { style:'currency', currency:'EUR', maximumFractionDigits:0 });
  const fmtEUR2 = new Intl.NumberFormat('fr-BE', { style:'currency', currency:'EUR', minimumFractionDigits:2, maximumFractionDigits:2 });
  const STORAGE_KEY = "mortgage_tool_v2_state";
  const DASH_KEY = "mortgage_tool_v2_dash";

  function toast(msg){
    const t = $("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._tm); toast._tm = setTimeout(() => t.classList.remove("show"), 2400);
  }
  window.addEventListener('error', (e) => { try{ toast("Erreur JS: " + (e.message || "inconnue")); }catch(_){} });

  function num(v){
    const s0 = String(v ?? '').trim().replace(/\u00A0/g,' ').replace(/\u202F/g,' ').replace(/€/g,'').replace(/\s+/g,'');
    if (!s0) return 0;
    if (s0.includes('.') && s0.includes(',')){ const s = s0.replace(/\./g,'').replace(',', '.'); const n = Number(s); return Number.isFinite(n)?n:0; }
    if (s0.includes(',')){ const s = s0.replace(',', '.'); const n = Number(s); return Number.isFinite(n)?n:0; }
    if (s0.includes('.')){ const parts = s0.split('.'); const looksThousands = parts.length > 2 || (parts.length===2 && parts[1].length===3); const s = looksThousands ? s0.replace(/\./g,'') : s0; const n = Number(s); return Number.isFinite(n)?n:0; }
    const n = Number(s0); return Number.isFinite(n)?n:0;
  }

  function setActiveTab(screen){
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.screen === screen));
    document.querySelectorAll(".screen").forEach(s => s.style.display = (s.id === `screen-${screen}`) ? "" : "none");
    const st = loadState(); st._ui = st._ui || {}; st._ui.screen = screen; saveState(st);
  }

  function kpi(el, key, val, meta=""){
    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `<div class="k">${key}</div><div class="v">${val}</div><div class="m">${meta}</div>`;
    el.appendChild(div);
  }

  function pmt(P, annualRatePct, years){
    const r = (annualRatePct/100)/12; const n = years*12;
    if (P<=0 || r<=0 || n<=0) return 0;
    return P * r / (1 - Math.pow(1+r, -n));
  }

  function amortizationSchedule(P, annualRatePct, years){
    const r = (annualRatePct/100)/12; const n = years*12;
    const m = pmt(P, annualRatePct, years);
    let bal = P, cumInt = 0;
    const rows = [];
    for (let i=1;i<=n;i++){
      const interest = bal * r;
      const principal = Math.min(bal, m - interest);
      bal = Math.max(0, bal - principal);
      cumInt += interest;
      rows.push({i, payment:m, interest, principal, balance:bal, cumInterest:cumInt});
      if (bal <= 0.0001) break;
    }
    return {payment:m, rows, totalInterest: cumInt, totalPaid: m*rows.length};
  }

  function renderAmort(rows){
    const body = $("amortBody"); body.innerHTML = "";
    let mode = "Mensuel";
    if (rows.length > 420){
      mode = "Annuel";
      const byYear = [];
      for (let y=1;y<=Math.ceil(rows.length/12);y++){
        const start=(y-1)*12, slice=rows.slice(start,start+12);
        const sumPay=slice.reduce((a,b)=>a+b.payment,0);
        const sumInt=slice.reduce((a,b)=>a+b.interest,0);
        const sumPrin=slice.reduce((a,b)=>a+b.principal,0);
        const bal=slice.length?slice[slice.length-1].balance:0;
        const cumInt=slice.length?slice[slice.length-1].cumInterest:0;
        byYear.push({period:`Année ${y}`, payment:sumPay, interest:sumInt, principal:sumPrin, balance:bal, cumInterest:cumInt});
      }
      for (const r of byYear){
        const tr=document.createElement("tr");
        tr.innerHTML = `<td>${r.period}</td><td>${fmtEUR2.format(r.payment)}</td><td>${fmtEUR2.format(r.interest)}</td><td>${fmtEUR2.format(r.principal)}</td><td>${fmtEUR.format(r.balance)}</td><td>${fmtEUR2.format(r.cumInterest)}</td>`;
        body.appendChild(tr);
      }
    } else {
      for (const r of rows){
        const tr=document.createElement("tr");
        tr.innerHTML = `<td>M${r.i}</td><td>${fmtEUR2.format(r.payment)}</td><td>${fmtEUR2.format(r.interest)}</td><td>${fmtEUR2.format(r.principal)}</td><td>${fmtEUR.format(r.balance)}</td><td>${fmtEUR2.format(r.cumInterest)}</td>`;
        body.appendChild(tr);
      }
    }
    $("amortMode").textContent = mode;
  }

  function downloadCSV(filename, header, rows){
    const escape = (v) => `"${String(v).replace(/"/g,'""')}"`;
    const csv = [header.map(escape).join(";"), ...rows.map(r => r.map(escape).join(";"))].join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function renderSim(){
    const P=num($("loanAmount").value);
    const rate=num($("loanRate").value);
    const years=parseInt($("loanYears").value,10);
    const years2=parseInt($("loanCompareYears").value,10);
    const asrd=num($("asrdMonthly").value);
    const other=num($("otherMonthlyCosts").value);
    if (P<=0 || rate<=0 || years<=0){ toast("Renseigne montant, taux et durée."); return; }
    const s=amortizationSchedule(P,rate,years);
    renderAmort(s.rows);
    const simK=$("simKpis"); simK.innerHTML="";
    kpi(simK,"Mensualité",fmtEUR2.format(s.payment),"Crédit seul");
    kpi(simK,"Mensualité tout-in",fmtEUR2.format(s.payment+asrd+other),"+ ASRD + charges");
    kpi(simK,"Intérêts totaux",fmtEUR2.format(s.totalInterest),`${s.rows.length} mensualités`);
    kpi(simK,"Coût total crédit",fmtEUR2.format(s.totalPaid),"Mensualités cumulées");
    const c1=amortizationSchedule(P,rate,years), c2=amortizationSchedule(P,rate,years2);
    const cmp=$("compareKpis"); cmp.innerHTML="";
    kpi(cmp,`${years} ans`,fmtEUR2.format(c1.payment),`Intérêts: ${fmtEUR2.format(c1.totalInterest)}`);
    kpi(cmp,`${years2} ans`,fmtEUR2.format(c2.payment),`Intérêts: ${fmtEUR2.format(c2.totalInterest)}`);
    kpi(cmp,"Δ mensualité",fmtEUR2.format(c2.payment-c1.payment),`${years2} − ${years}`);
    kpi(cmp,"Δ intérêts",fmtEUR2.format(c2.totalInterest-c1.totalInterest),"coût en intérêts");
    const st=loadState(); st.sim={P,rate,years,years2,asrd,other}; saveState(st);
    toast("Simulation calculée.");
  }

  function exportAmortCSV(){
    const rows=Array.from($("amortBody").querySelectorAll("tr")).map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim()));
    if (!rows.length){ toast("Fais une simulation d’abord."); return; }
    downloadCSV("amortissement.csv",["Période","Mensualité","Intérêts","Capital","Capital restant","Cumul intérêts"],rows);
    toast("CSV exporté.");
  }

  function renderBudget(){
    const price=num($("price").value), down=num($("downPayment").value), fees=num($("notaryFees").value), otherOneOff=num($("otherOneOff").value);
    const asrd=num($("budgetAsrdMonthly").value), loanManual=num($("loanFromBudget").value);
    if (price<=0){ toast("Renseigne le prix du bien."); return; }
    const totalProject=price+fees+otherOneOff;
    const loan=loanManual>0?loanManual:Math.max(0,totalProject-down);
    const cashNeeded=Math.max(0,totalProject-loan);
    const ltv=(loan/price)*100;
    const k=$("budgetKpis"); k.innerHTML="";
    kpi(k,"Projet total",fmtEUR.format(totalProject),"Prix + frais");
    kpi(k,"Prêt",fmtEUR.format(loan),`LTV: ${ltv.toFixed(1)}%`);
    kpi(k,"Apport / cash",fmtEUR.format(cashNeeded),"hors prêt");
    kpi(k,"ASRD",fmtEUR2.format(asrd),"€/mois");
    const years=parseInt($("budgetYears").value,10), extra=num($("budgetMonthlyExtra").value);
    const st=loadState(); const rate=st.sim?.rate?st.sim.rate:(num($("loanRate").value)||3.5);
    const payment=pmt(loan,rate,years);
    const allInMonthly=payment+asrd+extra;
    const totalAllIn=allInMonthly*years*12;
    const k2=$("budgetAllInKpis"); k2.innerHTML="";
    kpi(k2,"Mensualité crédit",fmtEUR2.format(payment),`taux: ${rate}%`);
    kpi(k2,"Mensualité tout-in",fmtEUR2.format(allInMonthly),"+ ASRD + charges");
    kpi(k2,"Coût tout-in",fmtEUR2.format(totalAllIn),`${years} ans`);
    kpi(k2,"Coût one-off",fmtEUR2.format(fees+otherOneOff),"hors mensualités");
    st.budget={price,down,fees,otherOneOff,asrd,loan,years,extra}; saveState(st);
    toast("Budget calculé.");
  }

  function renderInvest(){
    const price=num($("invPrice").value), rent=num($("invRent").value), loanM=num($("invLoanMonthly").value);
    const vacancy=num($("invVacancyPct").value)/100, charges=num($("invChargesAnnual").value), tax=num($("invTaxAnnual").value);
    const mgmt=num($("invMgmtPct").value)/100, maint=num($("invMaintPct").value)/100;
    if (price<=0 || rent<=0){ toast("Renseigne prix projet et loyer."); return; }
    const grossAnnualRent=rent*12;
    const vacancyCost=grossAnnualRent*vacancy, mgmtCost=grossAnnualRent*mgmt, maintCost=grossAnnualRent*maint;
    const netOperatingIncome=grossAnnualRent - vacancyCost - mgmtCost - maintCost - charges - tax;
    const netYield=netOperatingIncome/price, grossYield=grossAnnualRent/price;
    const cashflowMonthly=(netOperatingIncome/12)-loanM;
    const k=$("investKpis"); k.innerHTML="";
    kpi(k,"Rendement brut",(grossYield*100).toFixed(2)+" %","Loyer annuel / prix");
    kpi(k,"Rendement net",(netYield*100).toFixed(2)+" %","NOI / prix");
    kpi(k,"NOI annuel",fmtEUR2.format(netOperatingIncome),"après charges");
    kpi(k,"Cashflow / mois",fmtEUR2.format(cashflowMonthly),"NOI/12 − crédit");
    $("investDetails").innerHTML = `<div>Hypothèses:</div><ul>
      <li>Vacance: ${(vacancy*100).toFixed(1)}% → ${fmtEUR2.format(vacancyCost)}/an</li>
      <li>Gestion: ${(mgmt*100).toFixed(1)}% → ${fmtEUR2.format(mgmtCost)}/an</li>
      <li>Maintenance: ${(maint*100).toFixed(1)}% → ${fmtEUR2.format(maintCost)}/an</li>
      <li>Charges annuelles: ${fmtEUR2.format(charges)}</li>
      <li>Taxes annuelles: ${fmtEUR2.format(tax)}</li></ul>`;
    const st=loadState(); st.invest={price,rent,loanM,vacancy,charges,tax,mgmt,maint,netYield,cashflowMonthly}; saveState(st);
    toast("Investissement calculé.");
  }

  function renderBuyRent(){
    const horizon=Math.max(1,Math.round(num($("brHorizon").value)));
    const rentM0=num($("brRentMonthly").value), rentInfl=num($("brRentInflation").value)/100, altReturn=num($("brAltReturn").value)/100;
    const buyM=num($("brBuyMonthly").value), buyExtra=num($("brBuyExtraMonthly").value);
    const home0=num($("brHomeValue").value), homeApp=num($("brHomeAppreciation").value)/100;
    if (horizon<=0 || rentM0<=0 || buyM<=0 || home0<=0){ toast("Renseigne horizon, loyer, coût achat, valeur bien."); return; }
    let cumRent=0,cumBuy=0,altCapital=0;
    const rows=[];
    for (let y=1;y<=horizon;y++){
      const rentY=(rentM0*Math.pow(1+rentInfl,y-1))*12; cumRent+=rentY;
      const buyY=(buyM+buyExtra)*12; cumBuy+=buyY;
      const diff=Math.max(0,buyY-rentY); altCapital=(altCapital+diff)*(1+altReturn);
      const homeVal=home0*Math.pow(1+homeApp,y);
      rows.push({y,rentY,cumRent,buyY,cumBuy,altCapital,homeVal});
    }
    const body=$("buyRentBody"); body.innerHTML="";
    for (const r of rows){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${r.y}</td><td>${fmtEUR2.format(r.rentY)}</td><td>${fmtEUR2.format(r.cumRent)}</td><td>${fmtEUR2.format(r.buyY)}</td><td>${fmtEUR2.format(r.cumBuy)}</td><td>${fmtEUR2.format(r.altCapital)}</td><td>${fmtEUR.format(r.homeVal)}</td>`;
      body.appendChild(tr);
    }
    const end=rows[rows.length-1];
    const k=$("buyRentKpis"); k.innerHTML="";
    kpi(k,"Cumul loyer",fmtEUR2.format(end.cumRent),`${horizon} ans`);
    kpi(k,"Cumul achat",fmtEUR2.format(end.cumBuy),`${horizon} ans`);
    kpi(k,"Capital alternatif",fmtEUR2.format(end.altCapital),`rendement: ${(altReturn*100).toFixed(1)}%`);
    kpi(k,"Valeur du bien",fmtEUR.format(end.homeVal),`appréciation: ${(homeApp*100).toFixed(1)}%`);
    const st=loadState(); st.buyrent={horizon,rentM0,rentInfl,altReturn,buyM,buyExtra,home0,homeApp}; saveState(st);
    toast("Comparaison calculée.");
  }

  function exportBuyRentCSV(){
    const rows=Array.from($("buyRentBody").querySelectorAll("tr")).map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim()));
    if (!rows.length){ toast("Calcule d’abord."); return; }
    downloadCSV("acheter_vs_louer.csv",["Année","Loyer annuel","Cumul loyer","Coût achat annuel","Cumul achat","Capital alternatif","Valeur bien"],rows);
    toast("CSV exporté.");
  }

  function sepFees(price){
    const mode=$("sepFeesMode").value, val=num($("sepFeesValue").value);
    if (mode==="pct") return price*(val/100);
    if (mode==="fixed") return val;
    return 0;
  }

  function sepCompute(price){
    const bank=num($("sepBankBalance").value);
    const worksO=num($("sepWorksO").value), worksA=num($("sepWorksA").value);
    const shareO_pct=Math.max(0,Math.min(100,num($("sepShareO").value)));
    const shareO=shareO_pct/100;
    const fees=sepFees(price);
    const net=Math.max(0, price - fees - bank);
    const diffWorksO=Math.max(0, worksO - worksA);
    const reimbWorksO=Math.min(net, diffWorksO);
    const remaining=Math.max(0, net - reimbWorksO);
    const oShare=remaining*shareO, aShare=remaining*(1-shareO);
    const totalO=oShare+reimbWorksO, totalA=aShare;
    const buyoutPrice=num($("sepBuyoutPrice").value);
    let soulte=0;
    if (buyoutPrice>0){
      const buyFees=sepFees(buyoutPrice);
      const buyNet=Math.max(0, buyoutPrice - buyFees - bank);
      const buyReimb=Math.min(buyNet, diffWorksO);
      const buyRem=Math.max(0, buyNet - buyReimb);
      const buyO=buyRem*shareO + buyReimb;
      const buyA=buyRem*(1-shareO);
      const buyer=$("sepBuyer").value;
      soulte = (buyer==="O") ? buyA : buyO;
    }
    $("sepShareA").value = String(Math.round((100-shareO_pct)*10)/10);
    return {price,fees,bank,net,reimbWorksO,remaining,oShare,aShare,totalO,totalA,soulte};
  }

  function renderSeparation(){
    const minP=num($("sepSaleMin").value), maxP=num($("sepSaleMax").value);
    const step=Math.max(1000, num($("sepStep").value) || 5000);
    if (maxP < minP){ toast("Prix max doit être ≥ prix min."); return; }
    const rows=[];
    for (let p=minP; p<=maxP+0.001; p+=step){ rows.push(sepCompute(p)); if (rows.length>4000) break; }
    const body=$("sepBody"); body.innerHTML="";
    for (const r of rows){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${fmtEUR.format(r.price)}</td><td>${fmtEUR2.format(r.fees)}</td><td>${fmtEUR.format(r.bank)}</td><td>${fmtEUR.format(r.net)}</td><td>${fmtEUR.format(r.reimbWorksO)}</td><td>${fmtEUR.format(r.remaining)}</td><td>${fmtEUR.format(r.oShare)}</td><td>${fmtEUR.format(r.aShare)}</td><td><b>${fmtEUR.format(r.totalO)}</b></td><td><b>${fmtEUR.format(r.totalA)}</b></td><td>${fmtEUR.format(r.soulte)}</td>`;
      body.appendChild(tr);
    }
    const rMin=rows[0], rMax=rows[rows.length-1];
    const k=$("sepKpis"); k.innerHTML="";
    kpi(k,"O reçoit (min)",fmtEUR.format(rMin.totalO),`Prix: ${fmtEUR.format(rMin.price)}`);
    kpi(k,"A reçoit (min)",fmtEUR.format(rMin.totalA),`Frais: ${fmtEUR2.format(rMin.fees)}`);
    kpi(k,"O reçoit (max)",fmtEUR.format(rMax.totalO),`Prix: ${fmtEUR.format(rMax.price)}`);
    kpi(k,"A reçoit (max)",fmtEUR.format(rMax.totalA),`Net: ${fmtEUR.format(rMax.net)}`);
    if (num($("sepBuyoutPrice").value)>0){
      const rb=sepCompute(num($("sepBuyoutPrice").value));
      const who = $("sepBuyer").value==="O" ? "O → A" : "A → O";
      kpi(k,"Soulte (rachat)",fmtEUR.format(rb.soulte),who);
    } else {
      kpi(k,"Soulte (rachat)",fmtEUR.format(0),"Renseigne un prix");
    }
    const st=loadState();
    st.separation={minP,maxP,step,bank:num($("sepBankBalance").value),feesMode:$("sepFeesMode").value,feesValue:num($("sepFeesValue").value),shareO:num($("sepShareO").value),worksO:num($("sepWorksO").value),worksA:num($("sepWorksA").value),buyoutPrice:num($("sepBuyoutPrice").value),buyer:$("sepBuyer").value};
    saveState(st);
    toast("Répartition calculée.");
  }

  function exportSeparationCSV(){
    const rows=Array.from($("sepBody").querySelectorAll("tr")).map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim()));
    if (!rows.length){ toast("Calcule d’abord."); return; }
    downloadCSV("separation.csv",["Prix","Frais","Banque","Net","RembTravauxO","Reste","PartO","PartA","TotalO","TotalA","Soulte"],rows);
    toast("CSV exporté.");
  }

  function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }catch(e){ return {}; } }
  function saveState(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch(e){} }
  function loadDash(){ try{ return JSON.parse(localStorage.getItem(DASH_KEY) || "[]"); }catch(e){ return []; } }
  function saveDash(d){ try{ localStorage.setItem(DASH_KEY, JSON.stringify(d)); }catch(e){} }

  function renderDash(){
    const d=loadDash(), body=$("dashBody"); body.innerHTML="";
    for (const r of d){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${r.name}</td><td>${r.type}</td><td>${r.monthly}</td><td>${r.total}</td><td>${r.interest}</td><td>${r.cashflow}</td><td>${r.netYield}</td><td>${r.date}</td>`;
      body.appendChild(tr);
    }
  }

  function saveScenario(){
    const st=loadState();
    const date=new Date().toLocaleString('fr-BE');
    const d=loadDash();
    if (st.invest){
      const name=prompt("Nom du scénario (invest) ?", `Invest ${d.length+1}`) || `Invest ${d.length+1}`;
      d.unshift({name,type:"Invest",monthly:fmtEUR2.format(st.invest.loanM||0),total:"—",interest:"—",cashflow:fmtEUR2.format(st.invest.cashflowMonthly||0),netYield:((st.invest.netYield||0)*100).toFixed(2)+" %",date});
      saveDash(d); renderDash(); toast("Scénario enregistré (invest)."); return;
    }
    if (st.sim){
      const sch=amortizationSchedule(st.sim.P, st.sim.rate, st.sim.years);
      const name=prompt("Nom du scénario (prêt) ?", `Prêt ${d.length+1}`) || `Prêt ${d.length+1}`;
      d.unshift({name,type:"Prêt",monthly:fmtEUR2.format(sch.payment),total:fmtEUR2.format(sch.totalPaid),interest:fmtEUR2.format(sch.totalInterest),cashflow:"—",netYield:"—",date});
      saveDash(d); renderDash(); toast("Scénario enregistré (prêt)."); return;
    }
    toast("Fais un calcul avant d’enregistrer.");
  }

  function exportDashCSV(){
    const d=loadDash(); if (!d.length){ toast("Dashboard vide."); return; }
    const rows=d.map(r => [r.name,r.type,r.monthly,r.total,r.interest,r.cashflow,r.netYield,r.date]);
    downloadCSV("dashboard.csv",["Nom","Type","Mensualité","Coût total","Intérêts","Cashflow","Rendement net","Date"],rows);
    toast("CSV exporté.");
  }

  function clearDash(){ if (!confirm("Vider le dashboard ?")) return; saveDash([]); renderDash(); toast("Dashboard vidé."); }
  function resetAll(){ if (!confirm("Réinitialiser toutes les données ?")) return; try{localStorage.removeItem(STORAGE_KEY);}catch(e){} try{localStorage.removeItem(DASH_KEY);}catch(e){} location.reload(); }

  function restore(){
    const st=loadState(); const ui=st._ui||{}; if (ui.screen) setActiveTab(ui.screen);
    if (st.sim){ $("loanAmount").value=st.sim.P??""; $("loanRate").value=st.sim.rate??""; $("loanYears").value=String(st.sim.years??"20"); $("loanCompareYears").value=String(st.sim.years2??"15"); $("asrdMonthly").value=st.sim.asrd??""; $("otherMonthlyCosts").value=st.sim.other??""; }
    if (st.budget){ $("price").value=st.budget.price??""; $("downPayment").value=st.budget.down??""; $("notaryFees").value=st.budget.fees??""; $("otherOneOff").value=st.budget.otherOneOff??""; $("budgetAsrdMonthly").value=st.budget.asrd??""; $("loanFromBudget").value=st.budget.loan??""; $("budgetYears").value=String(st.budget.years??"20"); $("budgetMonthlyExtra").value=st.budget.extra??""; }
    if (st.invest){ $("invPrice").value=st.invest.price??""; $("invRent").value=st.invest.rent??""; $("invLoanMonthly").value=st.invest.loanM??""; $("invVacancyPct").value=(st.invest.vacancy??0.04)*100; $("invChargesAnnual").value=st.invest.charges??""; $("invTaxAnnual").value=st.invest.tax??""; $("invMgmtPct").value=(st.invest.mgmt??0)*100; $("invMaintPct").value=(st.invest.maint??0.03)*100; }
    if (st.buyrent){ $("brHorizon").value=st.buyrent.horizon??10; $("brRentMonthly").value=st.buyrent.rentM0??1200; $("brRentInflation").value=(st.buyrent.rentInfl??0.02)*100; $("brAltReturn").value=(st.buyrent.altReturn??0.03)*100; $("brBuyMonthly").value=st.buyrent.buyM??""; $("brBuyExtraMonthly").value=st.buyrent.buyExtra??0; $("brHomeValue").value=st.buyrent.home0??350000; $("brHomeAppreciation").value=(st.buyrent.homeApp??0.02)*100; }
    if (st.separation){ $("sepSaleMin").value=st.separation.minP??300000; $("sepSaleMax").value=st.separation.maxP??400000; $("sepStep").value=st.separation.step??5000; $("sepBankBalance").value=st.separation.bank??200000; $("sepFeesMode").value=st.separation.feesMode??"none"; $("sepFeesValue").value=st.separation.feesValue??0; $("sepShareO").value=st.separation.shareO??50; $("sepWorksO").value=st.separation.worksO??20000; $("sepWorksA").value=st.separation.worksA??0; $("sepBuyoutPrice").value=st.separation.buyoutPrice??""; $("sepBuyer").value=st.separation.buyer??"O"; $("sepShareA").value=String(100-num($("sepShareO").value)); }
    renderDash();
  }

  function init(){
    document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setActiveTab(t.dataset.screen)));
    $("simulateBtn").addEventListener("click", renderSim);
    $("exportAmortBtn").addEventListener("click", exportAmortCSV);
    $("calcBudgetBtn").addEventListener("click", renderBudget);
    $("calcInvestBtn").addEventListener("click", renderInvest);
    $("calcBuyRentBtn").addEventListener("click", renderBuyRent);
    $("buyRentExportBtn").addEventListener("click", exportBuyRentCSV);
    $("sepCalcBtn").addEventListener("click", renderSeparation);
    $("sepExportBtn").addEventListener("click", exportSeparationCSV);
    $("saveScenarioBtn").addEventListener("click", saveScenario);
    $("dashExportBtn").addEventListener("click", exportDashCSV);
    $("dashClearBtn").addEventListener("click", clearDash);
    $("printBtn").addEventListener("click", () => window.print());
    $("resetBtn").addEventListener("click", resetAll);
    $("sepShareO").addEventListener("input", () => { const v=Math.max(0,Math.min(100,num($("sepShareO").value))); $("sepShareA").value=String(Math.round((100-v)*10)/10); });
    restore();
    let deferredPrompt=null;
    window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;const b=$("installBtn"); if(b) b.style.display="";});
    $("installBtn").addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); try{await deferredPrompt.userChoice;}catch(_){} deferredPrompt=null; $("installBtn").style.display="none"; });
    if ('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
    toast("Prêt.");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
