/* Cardiac Murmurs: pressure traces, phonocardiogram, manoeuvres, synthesised sound, Test yourself.
   Teaching schematic. Pressure keyframes follow the textbook cardiac cycle (Guyton and Hall, Ch. 9)
   at 72 beats per minute; murmur shapes are derived from the pressure gradient across the lesion. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var T = 60 / 72;               /* one beat in seconds */
  var N = 600;                   /* samples per beat for drawing */

  /* ---------- pressure keyframes [time s, mmHg]; first and last value match (periodic) ---------- */
  var K = {
    nLV: [[0,8],[0.03,10],[0.06,82],[0.10,112],[0.15,122],[0.22,115],[0.28,100],[0.30,92],[0.33,40],[0.35,6],[0.40,2],[0.50,3],[0.70,5],[0.77,9],[T,8]],
    nAo: [[0,82],[0.06,80],[0.10,108],[0.15,119],[0.22,114],[0.28,101],[0.30,96],[0.315,91],[0.33,96],[0.45,93],[0.60,88],[0.75,84],[T,82]],
    nLA: [[0,7],[0.03,5],[0.05,7],[0.10,3],[0.25,7],[0.33,10],[0.35,9],[0.42,4],[0.60,5],[0.70,6],[0.76,10],[T,7]],
    nRV: [[0,4],[0.03,5],[0.06,14],[0.10,23],[0.15,26],[0.22,24],[0.28,19],[0.30,15],[0.33,5],[0.36,1],[0.45,1],[0.70,3],[0.77,5],[T,4]],
    asLV: [[0,12],[0.03,14],[0.06,82],[0.10,140],[0.18,178],[0.24,160],[0.28,120],[0.30,96],[0.33,45],[0.35,8],[0.40,4],[0.50,6],[0.70,9],[0.77,14],[T,12]],
    asAo: [[0,82],[0.06,78],[0.12,96],[0.20,106],[0.27,102],[0.30,97],[0.32,95],[0.34,96],[0.45,92],[0.60,88],[0.75,84],[T,82]],
    asLA: [[0,10],[0.03,7],[0.05,9],[0.10,5],[0.25,9],[0.33,12],[0.35,11],[0.42,6],[0.60,7],[0.70,8],[0.76,15],[T,10]],
    mrLV: [[0,10],[0.03,12],[0.06,70],[0.10,105],[0.15,116],[0.22,110],[0.28,96],[0.30,88],[0.33,40],[0.36,8],[0.40,4],[0.50,5],[0.70,7],[0.77,11],[T,10]],
    mrAo: [[0,80],[0.06,78],[0.08,79],[0.11,102],[0.15,113],[0.22,108],[0.28,97],[0.30,92],[0.315,88],[0.33,92],[0.45,89],[0.60,85],[0.75,82],[T,80]],
    mrLA: [[0,9],[0.03,8],[0.06,14],[0.12,24],[0.22,32],[0.30,37],[0.34,36],[0.37,30],[0.45,14],[0.60,10],[0.70,9],[0.76,13],[T,9]],
    trRV: [[0,5],[0.03,6],[0.06,14],[0.10,24],[0.15,28],[0.22,26],[0.28,20],[0.30,16],[0.33,6],[0.36,2],[0.45,2],[0.70,4],[0.77,7],[T,5]],
    trPA: [[0,11],[0.06,10],[0.08,10.5],[0.12,22],[0.16,26],[0.22,24],[0.28,19],[0.30,17],[0.32,15],[0.34,16],[0.50,13],[0.70,12],[T,11]],
    trRA: [[0,6],[0.03,5],[0.06,8],[0.12,12],[0.22,14],[0.30,15],[0.34,13],[0.38,8],[0.45,4],[0.65,4],[0.70,5],[0.76,8],[T,6]],
    hcLV: [[0,12],[0.03,14],[0.06,82],[0.10,118],[0.16,142],[0.22,165],[0.27,130],[0.30,95],[0.33,42],[0.35,8],[0.40,4],[0.50,6],[0.70,9],[0.77,14],[T,12]],
    hcAo: [[0,82],[0.06,78],[0.10,112],[0.14,120],[0.20,112],[0.27,102],[0.30,96],[0.315,91],[0.33,96],[0.45,92],[0.60,88],[0.75,84],[T,82]],
    arLV: [[0,30],[0.03,32],[0.05,60],[0.07,95],[0.11,140],[0.16,152],[0.22,140],[0.28,110],[0.30,96],[0.33,40],[0.35,10],[0.40,12],[0.50,18],[0.65,24],[0.77,28],[T,30]],
    arAo: [[0,48],[0.03,46],[0.05,45],[0.07,90],[0.11,135],[0.16,148],[0.22,135],[0.28,110],[0.30,100],[0.315,90],[0.33,82],[0.40,70],[0.50,62],[0.65,54],[0.77,50],[T,48]],
    msLV: [[0,18],[0.03,22],[0.06,82],[0.10,108],[0.15,116],[0.22,110],[0.28,96],[0.30,90],[0.33,40],[0.36,4],[0.45,3],[0.60,4],[0.70,5],[0.78,8],[T,18]],
    msLA: [[0,20],[0.03,18],[0.05,20],[0.10,16],[0.25,22],[0.33,28],[0.36,27],[0.42,23],[0.55,19],[0.70,18],[0.77,26],[T,20]]
  };

  /* trace styles: colour token, width, dash */
  var STY = {
    Ao: { label: "Aorta", tok: "a", w: 2.5, dash: "" },
    PA: { label: "Pulmonary artery", short: "PA", tok: "a", w: 2.5, dash: "" },
    LV: { label: "Left ventricle", short: "LV", tok: "d", w: 3, dash: "" },
    RV: { label: "Right ventricle", short: "RV", tok: "d", w: 3, dash: "" },
    LA: { label: "Left atrium", short: "LA", tok: "c", w: 2.5, dash: "7 4" },
    RA: { label: "Right atrium", short: "RA", tok: "c", w: 2.5, dash: "7 4" },
    RVv: { label: "Right ventricle", short: "RV", tok: "e", w: 2.5, dash: "9 3 2 3" }
  };

  var LEFT_EV = { s1: ["MV closes", 0.03], avo: ["AV opens", 0.06], s2: ["AV closes", 0.30], mvo: ["MV opens", 0.35] };

  var M = {
    normal: {
      name: "Normal heart sounds", short: "Normal", group: "normal", side: "left",
      traces: [["Ao", "nAo"], ["LV", "nLV"], ["LA", "nLA"]], ymax: 140, pair: null,
      timing: "No murmur", shape: "S1 and S2 only",
      character: "S1 is closure of the mitral and tricuspid valves; S2 is closure of the aortic (A2) then pulmonary (P2) valves.",
      where: "Listen at all four areas", loc: "all", radiation: "Not applicable", rad: null,
      position: "Breathe in to hear S2 split",
      why: "With normal valves, flow stays smooth (laminar), so there is no murmur. Inspiration draws more blood into the right heart and delays pulmonary valve closure, so A2 and P2 move apart: physiological splitting of S2.",
      assoc: ["S2 splits on inspiration and closes up on expiration"], causes: [], severity: [],
      eff: { insp: ["split", "S2 splits: P2 comes later because right ventricular filling rises."], valsalva: ["none", "No murmur to change."], squat: ["none", "No murmur to change."], handgrip: ["none", "No murmur to change."] },
      s1: 0.8, s2: 0.75
    },
    as: {
      name: "Aortic stenosis", short: "AS", group: "systolic", side: "left",
      traces: [["Ao", "asAo"], ["LV", "asLV"], ["LA", "asLA"]], ymax: 200, pair: ["LV", "Ao"], win: [0.06, 0.30], ref: 0, gamma: 1, loud: 1,
      pairText: "LV pressure above aortic pressure during ejection",
      timing: "Ejection systolic: starts after S1 and ends before S2", shape: "Crescendo-decrescendo (diamond); peaks later as the stenosis worsens",
      character: "Harsh", where: "Aortic area: 2nd intercostal space, right sternal edge", loc: "aortic",
      radiation: "To the carotids", rad: "carotids", position: "Diaphragm; louder in expiration",
      why: "During ejection the ventricle has to push blood through a narrow valve, so LV pressure rises well above aortic pressure. The gradient builds and then falls with ejection, which gives the diamond shape. When ejection stops, flow stops, so the murmur ends before S2.",
      assoc: ["Slow-rising, low-volume pulse", "Narrow pulse pressure", "Soft or absent A2 when severe", "Heaving, undisplaced apex beat (pressure load)", "Ejection click if the valve is still mobile, for example a bicuspid valve"],
      causes: ["Calcific degeneration in older adults", "Bicuspid aortic valve", "Rheumatic heart disease"],
      severity: ["Soft or absent A2", "Late-peaking murmur", "Slow-rising pulse and narrow pulse pressure", "Loudness does not track severity: a failing ventricle can make a severe stenosis quieter"],
      eff: { insp: ["none", "Left-sided: no louder on inspiration; louder in expiration."], valsalva: ["softer", "Less venous return, so less flow across the valve."], squat: ["louder", "More venous return and stroke volume, so more flow."], handgrip: ["softer", "Higher afterload reduces the flow and gradient across the valve."] },
      s1: 0.8, s2: 0.4, snd: { f: 230, q: 0.8, g: 1 }, pitch: 3
    },
    mr: {
      name: "Mitral regurgitation", short: "MR", group: "systolic", side: "left",
      traces: [["Ao", "mrAo"], ["LV", "mrLV"], ["LA", "mrLA"]], ymax: 140, pair: ["LV", "LA"], win: [0.03, 0.345], ref: 40, gamma: 0.5, loud: 0.85,
      ev: { avo: ["AV opens", 0.08], mvo: ["MV opens", 0.34] },
      pairText: "LV pressure above left atrial pressure for the whole of systole",
      timing: "Pansystolic: from S1 up to S2, and may run just past A2", shape: "Plateau: even through systole",
      character: "Blowing, high pitched", where: "Mitral area (apex): 5th intercostal space, mid-clavicular line", loc: "mitral",
      radiation: "To the left axilla", rad: "axilla", position: "Left lateral position, diaphragm, expiration",
      why: "From the moment the mitral valve should close, LV pressure is far above left atrial pressure, so blood leaks back for the whole of systole. The gradient is large and steady, so the murmur is flat from S1 to S2. The left atrium fills from behind, giving a tall v wave.",
      assoc: ["Soft S1", "S3 if regurgitation is severe (volume load)", "Displaced, volume-loaded apex beat", "Atrial fibrillation is common"],
      causes: ["Degenerative valve disease, including mitral valve prolapse", "Functional regurgitation from a dilated left ventricle", "Ischaemic: papillary muscle dysfunction or rupture after myocardial infarction", "Rheumatic heart disease", "Infective endocarditis"],
      severity: ["An S3 and a displaced apex suggest a large volume load", "Loudness is a poor guide to severity"],
      eff: { insp: ["none", "Left-sided: no louder on inspiration; louder in expiration."], valsalva: ["softer", "Less venous return and a smaller ventricle, so less regurgitation."], squat: ["louder", "More venous return and higher afterload."], handgrip: ["louder", "Higher afterload pushes more blood back into the atrium."] },
      s1: 0.5, s2: 0.75, snd: { f: 480, q: 0.9, g: 0.8 }, pitch: 2
    },
    tr: {
      name: "Tricuspid regurgitation", short: "TR", group: "systolic", side: "right",
      traces: [["PA", "trPA"], ["RV", "trRV"], ["RA", "trRA"]], ymax: 40, pair: ["RV", "RA"], win: [0.03, 0.335], ref: 8, gamma: 0.5, loud: 0.7,
      ev: { s1: ["TV closes", 0.03], avo: ["PV opens", 0.075], s2: ["PV closes", 0.30], mvo: ["TV opens", 0.335] },
      pairText: "RV pressure above right atrial pressure for the whole of systole",
      timing: "Pansystolic", shape: "Plateau", character: "Blowing",
      where: "Tricuspid area: left lower sternal edge, 4th to 5th intercostal space", loc: "tricuspid",
      radiation: "Usually little; heard best at the lower sternal edge", rad: null, position: "Supine; louder on inspiration",
      why: "Right ventricular pressure is above right atrial pressure for the whole of systole, so blood leaks back into the atrium. Pressures are much lower than on the left (note the 0 to 40 mmHg scale). Inspiration draws more blood into the right heart, so the murmur gets louder: Carvallo's sign.",
      assoc: ["Giant v waves (cv waves) in the jugular venous pulse", "Pulsatile liver", "Peripheral oedema and ascites"],
      causes: ["Functional: right ventricular dilatation, often from pulmonary hypertension or left heart disease", "Infective endocarditis, for example in people who inject drugs", "Rheumatic heart disease", "Carcinoid syndrome"],
      severity: ["Large cv waves and a pulsatile liver suggest significant regurgitation"],
      eff: { insp: ["louder", "Carvallo's sign: inspiration increases venous return to the right heart."], valsalva: ["softer", "Less venous return."], squat: ["louder", "More venous return."], handgrip: ["none", "Little effect on the right heart."] },
      s1: 0.75, s2: 0.75, snd: { f: 400, q: 0.9, g: 0.7 }, pitch: 2
    },
    vsd: {
      name: "Ventricular septal defect", short: "VSD", group: "systolic", side: "left",
      traces: [["Ao", "nAo"], ["LV", "nLV"], ["RVv", "nRV"]], ymax: 140, pair: ["LV", "RVv"], win: [0.03, 0.31], ref: 30, gamma: 0.5, loud: 1,
      pairText: "LV pressure above RV pressure for the whole of systole",
      timing: "Pansystolic", shape: "Plateau", character: "Harsh; often loud, sometimes with a thrill",
      where: "Left sternal edge, 3rd to 4th intercostal space", loc: "lse",
      radiation: "Often heard widely over the precordium", rad: null, position: "Supine",
      why: "LV systolic pressure is far higher than RV pressure, so blood jets through the defect from left to right for the whole of systole. A small defect can make a loud murmur because the jet is narrow and fast.",
      assoc: ["Palpable thrill (grade 4 or more)", "A large defect can lead to pulmonary hypertension; the murmur may then soften as the gradient falls"],
      causes: ["Congenital (most common)", "Acquired: septal rupture after myocardial infarction"],
      severity: ["A loud murmur does not mean a large defect"],
      eff: { insp: ["none", "No consistent change."], valsalva: ["softer", "Less venous return and flow."], squat: ["louder", "Higher afterload increases the left-to-right gradient."], handgrip: ["louder", "Higher LV pressure increases left-to-right flow."] },
      s1: 0.75, s2: 0.75, snd: { f: 300, q: 0.7, g: 1 }, pitch: 3
    },
    hocm: {
      name: "Hypertrophic obstructive cardiomyopathy (HOCM)", short: "HOCM", group: "systolic", side: "left",
      traces: [["Ao", "hcAo"], ["LV", "hcLV"], ["LA", "asLA"]], ymax: 220, pair: ["LV", "Ao"], win: [0.06, 0.30], ref: 0, gamma: 1, loud: 0.95, dynamic: true,
      pairText: "LV pressure above aortic pressure, rising as the outflow tract narrows",
      timing: "Ejection systolic, often peaking in mid to late systole", shape: "Crescendo-decrescendo with a later peak",
      character: "Harsh", where: "Left sternal edge, 3rd to 4th intercostal space", loc: "lse",
      radiation: "Usually little radiation to the carotids, unlike aortic stenosis", rad: null, position: "Louder on standing or during Valsalva",
      why: "The thickened septum and the mitral leaflet drawn forward in systole (systolic anterior motion) narrow the outflow tract as the ventricle empties. The obstruction is dynamic: the smaller the ventricle, the bigger the gradient. That is why the gradient here peaks later in systole.",
      assoc: ["Jerky pulse", "Double apical impulse", "Often with mitral regurgitation from systolic anterior motion", "Family history of sudden cardiac death"],
      causes: ["Inherited cardiomyopathy, most often from variants in sarcomere protein genes"],
      severity: ["An outflow gradient of 30 mmHg or more defines obstruction; 50 mmHg or more is the usual threshold for treatment to relieve it (ESC 2023)"],
      eff: { insp: ["none", "No consistent change."], valsalva: ["louder", "Less preload makes the ventricle smaller, which narrows the outflow tract."], squat: ["softer", "More preload and afterload keep the outflow tract wider."], handgrip: ["softer", "Higher afterload keeps the ventricle larger."] },
      s1: 0.75, s2: 0.7, snd: { f: 250, q: 0.8, g: 0.95 }, pitch: 3
    },
    innocent: {
      name: "Innocent flow murmur", short: "Innocent", group: "systolic", side: "left",
      traces: [["Ao", "nAo"], ["LV", "nLV"], ["LA", "nLA"]], ymax: 140, pair: ["LV", "Ao"], win: [0.06, 0.22], ref: 5, gamma: 1, loud: 0.35,
      pairText: "A tiny early difference between LV and aortic pressure as flow accelerates",
      timing: "Early to mid systolic, short", shape: "Short, soft crescendo-decrescendo",
      character: "Soft (grade 1 to 2); may sound vibratory or musical", where: "Left sternal edge or pulmonary area", loc: "pulmonary",
      radiation: "None", rad: null, position: "Often changes with posture",
      why: "The valves are normal, but brisk flow across the outflow tracts can be enough for a soft, short murmur, especially in high-flow states such as childhood, pregnancy, fever or anaemia. The heart sounds are normal.",
      assoc: ["Normal heart sounds and normal splitting of S2", "No thrill, no symptoms, normal pulses"],
      causes: ["Common in children", "High-output states: pregnancy, fever, anaemia, thyrotoxicosis"],
      severity: ["Features that are not innocent: diastolic timing, grade 3 or louder or a thrill, symptoms, abnormal heart sounds"],
      eff: { insp: ["variable", "May vary with breathing."], valsalva: ["softer", "Less venous return, so less flow."], squat: ["variable", "May vary with posture."], handgrip: ["none", "Little change."] },
      s1: 0.75, s2: 0.75, snd: { f: 170, q: 1.4, g: 0.45 }, pitch: 3
    },
    ar: {
      name: "Aortic regurgitation", short: "AR", group: "diastolic", side: "left",
      traces: [["Ao", "arAo"], ["LV", "arLV"]], ymax: 180, pair: ["Ao", "LV"], win: [0.30, T + 0.02], ref: 0, gamma: 1.4, loud: 0.65,
      ev: { avo: ["AV opens", 0.045] },
      pairText: "Aortic pressure above LV pressure through diastole",
      timing: "Early diastolic: starts at S2", shape: "Decrescendo",
      character: "High pitched, blowing", where: "Left sternal edge, 3rd to 4th intercostal space", loc: "lse",
      radiation: "Down the left sternal edge", rad: null, position: "Sitting forward, breath held in expiration, diaphragm",
      why: "After the aortic valve closes, aortic pressure is far higher than LV pressure. Blood leaks back straight away, so the murmur starts at S2. As the aorta empties and the ventricle fills, the gradient falls and the murmur fades: decrescendo. Left atrial pressure is left off this view to keep the gradient clear.",
      assoc: ["Collapsing (water-hammer) pulse", "Wide pulse pressure", "Displaced, volume-loaded apex beat", "Austin Flint murmur: a mid-diastolic rumble at the apex in severe regurgitation", "Ejection systolic flow murmur from the large stroke volume"],
      causes: ["Aortic root dilatation, for example Marfan syndrome or hypertension", "Bicuspid aortic valve", "Infective endocarditis", "Rheumatic heart disease", "Aortic dissection (acute regurgitation)"],
      severity: ["Wide pulse pressure with a low diastolic pressure", "Austin Flint murmur", "In acute severe regurgitation the murmur can be short and quiet"],
      eff: { insp: ["none", "Left-sided: no louder on inspiration; louder in expiration."], valsalva: ["softer", "Less venous return and flow."], squat: ["louder", "Higher afterload raises aortic diastolic pressure."], handgrip: ["louder", "Higher afterload increases the back-leak."] },
      s1: 0.75, s2: 0.75, snd: { f: 650, q: 1, g: 0.6 }, pitch: 1
    },
    ms: {
      name: "Mitral stenosis", short: "MS", group: "diastolic", side: "left",
      traces: [["Ao", "nAo"], ["LV", "msLV"], ["LA", "msLA"]], ymax: 140, pair: ["LA", "LV"], win: [0.36, T + 0.025], ref: 0, gamma: 1, loud: 1.15, os: 0.36,
      ev: { s1: ["MV closes", 0.025], mvo: ["MV opens", 0.355] },
      pairText: "Left atrial pressure above LV pressure through diastole",
      timing: "Mid-diastolic, after an opening snap; presystolic accentuation in sinus rhythm", shape: "Low rumble that fades, then builds again just before S1 (atrial contraction)",
      character: "Low-pitched rumble", where: "Apex", loc: "mitral",
      radiation: "None; localised to the apex", rad: null, position: "Left lateral position, bell, expiration; easier to hear after exercise",
      why: "The narrowed mitral valve holds pressure back in the left atrium, so left atrial pressure stays above LV pressure through diastole. The stiff valve snaps open (opening snap) and the gradient drives a low rumble. Atrial contraction raises the gradient again just before S1, if the heart is in sinus rhythm.",
      assoc: ["Loud S1", "Opening snap", "Malar flush", "Atrial fibrillation is common, and presystolic accentuation is then lost", "Tapping, undisplaced apex beat"],
      causes: ["Rheumatic heart disease (most common)", "Mitral annular calcification in older adults"],
      severity: ["A shorter interval from S2 to the opening snap means higher left atrial pressure and more severe stenosis", "A longer murmur means more severe stenosis"],
      eff: { insp: ["none", "Left-sided: no louder on inspiration; louder in expiration."], valsalva: ["softer", "Less venous return, so less flow across the valve."], squat: ["louder", "More venous return."], handgrip: ["variable", "Inconsistent; exercise and a faster heart rate make it louder."] },
      s1: 1.0, s2: 0.75, snd: { f: 95, q: 0.7, g: 1.3 }, pitch: 5
    }
  };
  var ORDER = { normal: ["normal"], systolic: ["as", "mr", "tr", "vsd", "hocm", "innocent"], diastolic: ["ar", "ms"] };
  var GROUP_LABEL = { normal: "Baseline", systolic: "Systolic", diastolic: "Diastolic" };

  var MANS = [
    { id: "rest", label: "At rest", note: "Quiet breathing, lying at about 45 degrees." },
    { id: "insp", label: "Breath in", note: "Inspiration increases venous return to the right heart." },
    { id: "valsalva", label: "Valsalva", note: "Strain against a closed airway: venous return and preload fall." },
    { id: "squat", label: "Squat", note: "Squatting from standing: venous return and afterload rise." },
    { id: "handgrip", label: "Handgrip", note: "Sustained handgrip: afterload rises." }
  ];
  var GAIN = { louder: 1.4, softer: 0.5, none: 1, variable: 1, split: 1 };
  var EFF_WORD = { louder: "Louder", softer: "Softer", none: "Little change", variable: "Variable", split: "S2 splits" };
  var HOCM_DYN = { rest: 1, insp: 1, valsalva: 1.5, squat: 0.55, handgrip: 0.6 };

  /* ---------- maths ---------- */
  function monotone(keys) {
    var n = keys.length, xs = [], ys = [], d = [], m = [], i;
    for (i = 0; i < n; i++) { xs.push(keys[i][0]); ys.push(keys[i][1]); }
    for (i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
    }
    return function (x) {
      x = ((x % T) + T) % T;
      var k = 0; while (k < n - 2 && x > xs[k + 1]) k++;
      var h = xs[k + 1] - xs[k], t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    };
  }
  var FN = {}; Object.keys(K).forEach(function (k) { FN[k] = monotone(K[k]); });
  function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  /* ---------- state ---------- */
  var S = { id: "as", man: "rest", playing: false, anim: false, test: null };

  function events(m) {
    var ev = {}; Object.keys(LEFT_EV).forEach(function (k) { ev[k] = LEFT_EV[k].slice(); });
    if (m.ev) Object.keys(m.ev).forEach(function (k) { ev[k] = m.ev[k]; });
    return ev;
  }
  function effOf(m, man) { return man === "rest" ? ["none", ""] : m.eff[man]; }

  /* sampled model for the current murmur and manoeuvre */
  function model(id, man) {
    var m = M[id], tr = {}, i, t;
    m.traces.forEach(function (p) { tr[p[0]] = []; });
    var dyn = m.dynamic ? HOCM_DYN[man] : 1;
    for (i = 0; i < N; i++) {
      t = i / N * T;
      m.traces.forEach(function (p) {
        var v = FN[p[1]](t);
        if (dyn !== 1 && p[0] === "LV") {
          var ao = FN["hcAo"](t), sys = t >= 0.06 && t <= 0.30;
          if (sys && v > ao) v = ao + (v - ao) * dyn;
        }
        tr[p[0]].push(v);
      });
    }
    var env = new Array(N).fill(0), grad = new Array(N).fill(0), gmax = 0;
    if (m.pair) {
      var hi = tr[m.pair[0]], lo = tr[m.pair[1]];
      for (i = 0; i < N; i++) {
        t = i / N * T;
        var tt = (m.win[1] > T && t < m.win[0]) ? t + T : t;
        if (tt < m.win[0] || tt > m.win[1]) continue;
        var g = Math.max(0, hi[i] - lo[i]);
        g *= smooth(m.win[0], m.win[0] + 0.012, tt) * (1 - smooth(m.win[1] - 0.008, m.win[1], tt));
        grad[i] = g; if (g > gmax) gmax = g;
      }
      var ref = m.ref || gmax || 1;
      var loud = m.loud * GAIN[effOf(m, man)[0]];
      if (m.dynamic) loud = m.loud * Math.min(1.5, Math.max(0.5, dyn));
      for (i = 0; i < N; i++) env[i] = Math.min(1, Math.pow(Math.min(1, grad[i] / ref), m.gamma)) * Math.min(1.25, loud);
    }
    var ev = events(m);
    var split = (man === "insp") ? 0.04 : 0.015;
    return { m: m, tr: tr, env: env, grad: grad, gmax: gmax, ev: ev, split: split };
  }

  /* ---------- DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function tok() { return window.PhysioTheme ? PhysioTheme.tokens() : { a: "#184A63", b: "#0B6B5F", c: "#9A3412", d: "#1A2330", e: "#5C4A2E", text: "#1A2330", muted: "#4E5968", border: "#D4D0C8", grid: "#E4DFD6", surface: "#FFFFFF" }; }
  function hash(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

  /* ---------- drawing ---------- */
  var geo = null;
  function render() {
    var box = $("mmSvgBox"), svg = $("mmSvg");
    var W = Math.max(320, Math.min(760, Math.round(box.clientWidth || 700)));
    var narrow = W < 560;
    var L = narrow ? 40 : 50, R = narrow ? 50 : 66;
    var pTop = 26, pH = narrow ? 170 : 210, evH = 34, phTop = pTop + pH + evH + 10, phH = narrow ? 96 : 110, axisH = 34;
    var H = phTop + phH + axisH;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.innerHTML = "";
    var c = tok(), md = model(S.id, S.man), m = md.m, masked = S.test && !S.test.answered;
    var fs = narrow ? 12 : 13;
    var x = function (t) { return L + (t / T) * (W - L - R); };
    var yP = function (p) { return pTop + pH - (p / m.ymax) * pH; };
    geo = { x: x, top: pTop, bottom: phTop + phH, W: W };

    if (window.PhysioTheme) PhysioTheme.ensurePatterns(svg);
    var defs = el("defs", {}, svg);
    var pat = el("pattern", { id: "mm-grad", patternUnits: "userSpaceOnUse", width: 7, height: 7, patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 7, height: 7, fill: c.b, "fill-opacity": "0.16" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: c.b, "stroke-width": 2.2 }, pat);

    var ev = md.ev;
    /* systole band */
    [[pTop, pH], [phTop, phH]].forEach(function (b) {
      el("rect", { x: x(ev.s1[1]), y: b[0], width: x(ev.s2[1]) - x(ev.s1[1]), height: b[1], fill: c.grid, "fill-opacity": "0.45" }, svg);
    });
    el("text", { x: (x(ev.s1[1]) + x(ev.s2[1])) / 2, y: pTop - 9, "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: c.text, "class": "mm-sans" }, svg, "Systole");
    el("text", { x: (x(ev.s2[1]) + x(T)) / 2, y: pTop - 9, "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: c.text, "class": "mm-sans" }, svg, "Diastole");

    /* pressure axis */
    var step = m.ymax <= 40 ? 10 : (m.ymax <= 140 ? 20 : 40);
    for (var p = 0; p <= m.ymax; p += step) {
      el("line", { x1: L, x2: W - R, y1: yP(p), y2: yP(p), stroke: c.grid, "stroke-width": 1 }, svg);
      el("text", { x: L - 6, y: yP(p) + 4, "text-anchor": "end", "font-size": fs - 1, fill: c.muted, "class": "mm-sans" }, svg, String(p));
    }
    el("text", { x: 4, y: pTop - 9, "font-size": fs - 1, fill: c.muted, "class": "mm-sans" }, svg, "mmHg");
    el("line", { x1: L, x2: L, y1: pTop, y2: pTop + pH, stroke: c.muted, "stroke-width": 1 }, svg);

    /* valve events */
    var evKeys = ["s1", "avo", "s2", "mvo"];
    evKeys.forEach(function (k, i) {
      var t = ev[k][1], xx = x(t);
      el("line", { x1: xx, x2: xx, y1: pTop, y2: phTop + phH, stroke: c.muted, "stroke-width": 1, "stroke-dasharray": "2 3" }, svg);
      var row = (k === "s1" || k === "s2") ? 0 : 1;
      el("text", { x: xx, y: pTop + pH + 14 + row * 15, "text-anchor": "middle", "font-size": fs - 1, "font-weight": 600, fill: c.text, "class": "mm-sans mm-halo" }, svg, ev[k][0]);
    });

    if (masked) {
      el("rect", { x: L + 1, y: pTop + 1, width: W - L - R - 2, height: pH - 2, fill: c.surface, "fill-opacity": "0.92" }, svg);
      el("text", { x: (L + W - R) / 2, y: pTop + pH / 2, "text-anchor": "middle", "font-size": fs + 1, "font-weight": 700, fill: c.text, "class": "mm-sans" }, svg, "Pressure traces hidden until you answer");
    } else {
      /* gradient fill */
      if (m.pair) {
        var hi = md.tr[m.pair[0]], lo = md.tr[m.pair[1]], seg = [], segs = [];
        for (var i = 0; i <= N; i++) {
          var ii = i % N;
          if (i < N && md.grad[ii] > 0.4) seg.push(i); else if (seg.length) { segs.push(seg); seg = []; }
        }
        segs.forEach(function (sg) {
          var d = "", j;
          for (j = 0; j < sg.length; j++) d += (j ? " L " : "M ") + x(sg[j] / N * T).toFixed(1) + " " + yP(hi[sg[j]]).toFixed(1);
          for (j = sg.length - 1; j >= 0; j--) d += " L " + x(sg[j] / N * T).toFixed(1) + " " + yP(lo[sg[j]]).toFixed(1);
          el("path", { d: d + " Z", fill: "url(#mm-grad)", stroke: "none" }, svg);
        });
      }
      /* traces */
      m.traces.forEach(function (pr) {
        var st = STY[pr[0]], arr = md.tr[pr[0]], d = "";
        for (var i = 0; i <= N; i++) d += (i ? " L " : "M ") + x(i / N * T).toFixed(1) + " " + yP(arr[i % N]).toFixed(1);
        el("path", { d: d, fill: "none", stroke: c[st.tok], "stroke-width": st.w, "stroke-dasharray": st.dash || null, "stroke-linejoin": "round" }, svg);
      });
      /* right-end labels with simple de-overlap */
      var labs = m.traces.map(function (pr) { return { k: pr[0], y: yP(md.tr[pr[0]][N - 1]) }; }).sort(function (a, b) { return a.y - b.y; });
      for (var q = 1; q < labs.length; q++) if (labs[q].y - labs[q - 1].y < fs + 2) labs[q].y = labs[q - 1].y + fs + 2;
      labs.forEach(function (lb) {
        var st = STY[lb.k];
        el("text", { x: W - R + 6, y: Math.min(pTop + pH + 2, lb.y + 4), "font-size": fs, "font-weight": 700, fill: c[st.tok], "class": "mm-sans" }, svg, st.short || "Aorta");
      });
      /* gradient label */
      if (m.pair && md.gmax > 0) {
        var imax = 0; for (var g = 0; g < N; g++) if (md.grad[g] > md.grad[imax]) imax = g;
        var gx = x(imax / N * T), yHi = yP(md.tr[m.pair[0]][imax]), yLo = yP(md.tr[m.pair[1]][imax]);
        var gap = yLo - yHi, label = "Gradient", lw = label.length * fs * 0.55;
        var gxClamped = Math.max(L + lw / 2 + 2, Math.min(W - R - lw / 2 - 2, gx));
        if (gap > fs + 8) el("text", { x: gxClamped, y: (yHi + yLo) / 2 + 4, "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: c.text, "class": "mm-sans mm-halo" }, svg, label);
        else {
          var ly = Math.max(pTop + fs, yHi - 14);
          el("line", { x1: gx, x2: gx, y1: ly + 3, y2: yHi - 2, stroke: c.text, "stroke-width": 1 }, svg);
          el("text", { x: gxClamped, y: ly, "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: c.text, "class": "mm-sans mm-halo" }, svg, label);
        }
      }
    }

    /* phonocardiogram */
    var base = phTop + phH / 2 + 6, amp = phH / 2 - 12;
    el("line", { x1: L, x2: W - R, y1: base, y2: base, stroke: c.border, "stroke-width": 1 }, svg);
    el("text", { x: 4, y: phTop + 10, "font-size": fs - 1, fill: c.muted, "class": "mm-sans" }, svg, narrow ? "Sound" : "Sound");
    var dx = m.pitch ? Math.max(1.6, m.pitch * (narrow ? 0.8 : 1)) : 2.5, dM = "";
    if (m.pair) {
      for (var px = L; px <= W - R; px += dx) {
        var ti = Math.floor((px - L) / (W - L - R) * N) % N, a = md.env[ti] * amp * (0.45 + 0.55 * hash(Math.round(px * 7)));
        if (a > 0.6) dM += "M " + px.toFixed(1) + " " + (base - a).toFixed(1) + " V " + (base + a).toFixed(1) + " ";
      }
      if (dM) el("path", { d: dM, stroke: c.b, "stroke-width": 1.4, fill: "none" }, svg);
      /* envelope outline */
      var top = "", started = false;
      for (var e = 0; e <= N; e++) {
        var v = md.env[e % N];
        if (v > 0.01) { top += (started ? " L " : " M ") + x(e / N * T).toFixed(1) + " " + (base - v * amp - 2).toFixed(1); started = true; }
        else started = false;
      }
      if (top) el("path", { d: top, stroke: c.b, "stroke-width": 1.5, "stroke-dasharray": "4 3", fill: "none" }, svg);
    }
    /* heart sounds */
    var sounds = soundList(md), dS = "";
    sounds.forEach(function (s) {
      var x0 = x(s.t - s.w), x1 = x(s.t + s.w);
      for (var px = x0; px <= x1; px += 1.6) {
        var u = (px - x0) / (x1 - x0), a = s.a * amp * Math.sin(Math.PI * u) * (0.55 + 0.45 * hash(Math.round(px * 13)));
        dS += "M " + px.toFixed(1) + " " + (base - a).toFixed(1) + " V " + (base + a).toFixed(1) + " ";
      }
    });
    el("path", { d: dS, stroke: c.d, "stroke-width": 1.8, fill: "none" }, svg);
    sounds.forEach(function (s) {
      if (!s.label) return;
      el("text", { x: x(s.t) + (s.dx || 0), y: phTop + 8, "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: c.text, "class": "mm-sans mm-halo" }, svg, s.label);
    });
    /* murmur shape label */
    if (m.pair && !masked) {
      var sum = 0, wsum = 0; for (var z = 0; z < N; z++) { var tz = z / N * T; if (m.win[1] > T && tz < m.win[0]) tz += T; sum += md.env[z] * tz; wsum += md.env[z]; }
      var tc = wsum ? (sum / wsum) % T : 0, txt = shapeWord(m), tw = txt.length * (fs - 1) * 0.52;
      var lx = Math.max(L + tw / 2, Math.min(W - R - tw / 2, x(tc)));
      el("text", { x: lx, y: phTop + phH - 2, "text-anchor": "middle", "font-size": fs - 1, "font-weight": 700, fill: c.text, "class": "mm-sans mm-halo" }, svg, txt);
    }
    /* time axis */
    var ay = phTop + phH + 4;
    el("line", { x1: L, x2: W - R, y1: ay, y2: ay, stroke: c.muted, "stroke-width": 1 }, svg);
    [0, 0.2, 0.4, 0.6, 0.8].forEach(function (t) {
      el("line", { x1: x(t), x2: x(t), y1: ay, y2: ay + 4, stroke: c.muted }, svg);
      el("text", { x: x(t), y: ay + 16, "text-anchor": "middle", "font-size": fs - 1, fill: c.muted, "class": "mm-sans" }, svg, t.toFixed(1));
    });
    el("text", { x: W - R, y: ay + 30, "text-anchor": "end", "font-size": fs - 1, fill: c.muted, "class": "mm-sans" }, svg, "Time (s), one beat");

    /* playhead */
    var ph = el("g", { id: "mmPlayhead", visibility: (S.playing || S.anim) ? "visible" : "hidden" }, svg);
    el("line", { x1: 0, x2: 0, y1: pTop, y2: phTop + phH, stroke: c.text, "stroke-width": 2 }, ph);
    el("path", { d: "M -6 " + (pTop - 2) + " L 6 " + (pTop - 2) + " L 0 " + (pTop + 6) + " Z", fill: c.text }, ph);

    renderLegend(md, masked);
    $("mm-svg-desc").textContent = describe(md, masked);
  }

  function shapeWord(m) {
    return { as: "Crescendo-decrescendo", hocm: "Late-peaking ejection", innocent: "Soft, short, early", mr: "Pansystolic plateau", tr: "Pansystolic plateau", vsd: "Pansystolic plateau", ar: "Early diastolic decrescendo", ms: "Mid-diastolic rumble" }[S.id] || "";
  }
  function soundList(md) {
    var m = md.m, ev = md.ev, list = [];
    list.push({ t: ev.s1[1], w: 0.022, a: m.s1, f: 55, label: "S1" });
    if (S.id === "normal" && S.man === "insp") {
      list.push({ t: ev.s2[1], w: 0.014, a: m.s2, f: 70, label: "A2", dx: -8 });
      list.push({ t: ev.s2[1] + md.split, w: 0.012, a: m.s2 * 0.75, f: 80, label: "P2", dx: 8 });
    } else {
      list.push({ t: ev.s2[1], w: 0.016, a: m.s2, f: 70, label: "S2" });
    }
    if (m.os) list.push({ t: m.os, w: 0.007, a: 0.6, f: 120, label: "OS", dx: 10 });
    return list;
  }
  function renderLegend(md, masked) {
    var c = tok(), h = "";
    if (!masked) md.m.traces.forEach(function (pr) {
      var st = STY[pr[0]];
      h += '<span class="mm-key"><svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" stroke="' + c[st.tok] + '" stroke-width="' + st.w + '"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : "") + '/></svg>' + esc(st.label) + "</span>";
    });
    if (md.m.pair && !masked) h += '<span class="mm-key"><svg width="22" height="14" aria-hidden="true"><rect x="1" y="1" width="20" height="12" fill="url(#mm-grad)" stroke="' + c.b + '"/></svg>Pressure gradient</span>';
    h += '<span class="mm-key"><svg width="22" height="14" aria-hidden="true"><path d="M3 2V12M7 4V10M11 1V13M15 3V11M19 5V9" stroke="' + c.d + '" stroke-width="1.8"/></svg>Heart sounds</span>';
    if (md.m.pair) h += '<span class="mm-key"><svg width="22" height="14" aria-hidden="true"><path d="M3 5V9M6 4V10M9 3V11M12 4V10M15 5V9M18 6V8" stroke="' + c.b + '" stroke-width="1.4"/></svg>Murmur</span>';
    $("mmLegend").innerHTML = h;
  }
  function describe(md, masked) {
    var m = md.m, man = MANS.filter(function (x) { return x.id === S.man; })[0].label;
    var s = (masked ? "Mystery murmur" : m.name) + ", " + man.toLowerCase() + ". ";
    if (!masked) s += "Pressure traces: " + m.traces.map(function (p) { return STY[p[0]].label; }).join(", ") + ". ";
    if (m.pair && !masked) s += "Shaded gradient: " + m.pairText + ". ";
    s += "Phonocardiogram: S1, " + (m.pair ? (masked ? "a murmur, " : shapeWord(m).toLowerCase() + " murmur, ") : "") + (S.id === "normal" && S.man === "insp" ? "split S2 (A2 then P2)" : "S2") + (m.os ? ", opening snap after S2" : "") + ".";
    return s;
  }

  /* ---------- side panel ---------- */
  function chest(m) {
    var c = tok(), on = m.loc;
    var areas = { aortic: [74, 64, "Aortic"], pulmonary: [118, 64, "Pulmonary"], lse: [112, 92, "Left sternal edge"], tricuspid: [108, 120, "Tricuspid"], mitral: [146, 136, "Mitral (apex)"] };
    var s = '<svg class="mm-chest" viewBox="0 0 200 186" role="img" aria-label="Chest diagram: ' + esc(m.where) + (m.rad ? ", radiates " + (m.rad === "carotids" ? "to the carotids" : "to the left axilla") : "") + '">';
    s += '<path d="M40 30 Q100 8 160 30 L176 70 L172 180 L28 180 L24 70 Z" fill="' + c.surface + '" stroke="' + c.muted + '" stroke-width="1.5"/>';
    s += '<path d="M60 26 Q78 22 92 30 M108 30 Q122 22 140 26" fill="none" stroke="' + c.muted + '" stroke-width="1.5"/>';
    s += '<rect x="92" y="30" width="16" height="100" rx="6" fill="' + c.grid + '" stroke="' + c.muted + '"/>';
    for (var r = 0; r < 4; r++) s += '<path d="M44 ' + (52 + r * 26) + ' Q70 ' + (60 + r * 26) + ' 90 ' + (54 + r * 26) + ' M110 ' + (54 + r * 26) + ' Q130 ' + (60 + r * 26) + ' 156 ' + (52 + r * 26) + '" fill="none" stroke="' + c.grid + '" stroke-width="2"/>';
    if (m.rad === "carotids") s += '<path d="M74 54 L70 14 M66 22 L70 12 L75 21" fill="none" stroke="' + c.text + '" stroke-width="2"/><text x="80" y="14" font-size="14" font-weight="700" fill="' + c.text + '" class="mm-sans">to carotids</text>';
    if (m.rad === "axilla") s += '<path d="M156 134 L188 112 M178 111 L189 111 L185 121" fill="none" stroke="' + c.text + '" stroke-width="2"/><text x="122" y="100" font-size="14" font-weight="700" fill="' + c.text + '" class="mm-sans">to axilla</text>';
    Object.keys(areas).forEach(function (k) {
      var a = areas[k], hit = on === k || on === "all";
      if (hit) s += '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="9" fill="' + c.b + '" fill-opacity="0.25" stroke="' + c.text + '" stroke-width="2.5"/><circle cx="' + a[0] + '" cy="' + a[1] + '" r="3" fill="' + c.text + '"/>';
      else s += '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="4" fill="none" stroke="' + c.muted + '" stroke-width="1.5"/>';
    });
    s += '<text x="6" y="182" font-size="13" fill="' + c.muted + '" class="mm-sans">Patient\u2019s right</text></svg>';
    return s;
  }
  function list(arr) { return "<ul>" + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"; }
  function effChips(m) {
    return '<ul class="mm-chips">' + ["insp", "valsalva", "squat", "handgrip"].map(function (k) {
      var e = m.eff[k], lab = MANS.filter(function (x) { return x.id === k; })[0].label;
      var mark = { louder: "\u25B2", softer: "\u25BC", none: "=", variable: "~", split: "\u2225" }[e[0]];
      return '<li class="mm-chip' + (S.man === k ? " is-on" : "") + '"><span class="mm-chip-k">' + esc(lab) + '</span> <span class="mm-chip-v"><span aria-hidden="true">' + mark + " </span>" + EFF_WORD[e[0]] + "</span></li>";
    }).join("") + "</ul>";
  }
  function renderExplain() {
    var p = $("explainPanel");
    if (S.test) { p.innerHTML = testHTML(); bindTest(); return; }
    var m = M[S.id], e = effOf(m, S.man), man = MANS.filter(function (x) { return x.id === S.man; })[0];
    var kick = m.group === "normal" ? "Baseline" : (m.group === "systolic" ? "Systolic murmur" : "Diastolic murmur") + (m.side === "right" ? " \u00b7 right heart" : " \u00b7 left heart");
    var h = '<p class="explain-kicker">' + esc(kick) + "</p>";
    h += '<h2 class="explain-title">' + esc(m.name) + "</h2>";
    h += '<div class="mm-facts"><dl>' +
      "<dt>Timing</dt><dd>" + esc(m.timing) + "</dd>" +
      "<dt>Shape</dt><dd>" + esc(m.shape) + "</dd>" +
      "<dt>Character</dt><dd>" + esc(m.character) + "</dd>" +
      "<dt>Where</dt><dd>" + esc(m.where) + "</dd>" +
      "<dt>Radiation</dt><dd>" + esc(m.radiation) + "</dd>" +
      "<dt>Best heard</dt><dd>" + esc(m.position) + "</dd></dl>" + chest(m) + "</div>";
    h += '<div class="panel-block"><h3>Why it happens</h3><p>' + esc(m.why) + "</p></div>";
    h += '<div class="panel-block"><h3>' + (S.man === "rest" ? "Manoeuvres" : esc(man.label) + ": " + esc(EFF_WORD[e[0]].toLowerCase())) + "</h3>" +
      (S.man === "rest" ? "<p>Pick a manoeuvre to see the murmur change.</p>" : "<p>" + esc(e[1]) + "</p>") + effChips(m) + "</div>";
    if (m.assoc.length) h += '<details class="mm-note"><summary>Associated signs</summary>' + list(m.assoc) + "</details>";
    if (m.causes.length) h += '<details class="mm-note"><summary>Common causes</summary>' + list(m.causes) + "</details>";
    if (m.severity.length) h += '<details class="mm-note"><summary>Severity clues</summary>' + list(m.severity) + "</details>";
    p.innerHTML = h;
  }

  /* ---------- controls ---------- */
  function renderControls() {
    var g = $("murmurGroups"), h = "";
    ["normal", "systolic", "diastolic"].forEach(function (grp) {
      h += '<div class="mm-group"><p class="scen-group-label" id="mmg-' + grp + '">' + GROUP_LABEL[grp] + '</p><div class="mm-row" role="group" aria-labelledby="mmg-' + grp + '">';
      ORDER[grp].forEach(function (id) {
        h += '<button type="button" class="scen-btn mm-btn" data-id="' + id + '" aria-pressed="' + (S.id === id) + '"><span class="mm-btn-short">' + esc(M[id].short) + '</span><span class="mm-btn-long">' + esc(id === "normal" ? "Heart sounds" : (id === "hocm" ? "Hypertrophic obstructive" : M[id].name)) + "</span></button>";
      });
      h += "</div></div>";
    });
    g.innerHTML = h;
    g.querySelectorAll(".mm-btn").forEach(function (b) { b.addEventListener("click", function () { select(b.getAttribute("data-id")); }); });
    var mb = $("manButtons"), mh = "";
    MANS.forEach(function (mn) { mh += '<button type="button" class="scen-btn mm-man" data-man="' + mn.id + '" aria-pressed="' + (S.man === mn.id) + '">' + esc(mn.label) + "</button>"; });
    mb.innerHTML = mh;
    mb.querySelectorAll(".mm-man").forEach(function (b) { b.addEventListener("click", function () { setMan(b.getAttribute("data-man")); }); });
    $("manNote").textContent = MANS.filter(function (x) { return x.id === S.man; })[0].note;
  }
  function select(id) { S.id = id; refresh(); }
  function setMan(man) { S.man = man; refresh(); }
  function refresh() {
    document.querySelectorAll(".mm-btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === S.id)); });
    document.querySelectorAll(".mm-man").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-man") === S.man)); });
    $("manNote").textContent = MANS.filter(function (x) { return x.id === S.man; })[0].note;
    render(); renderExplain();
    if (S.playing) audioRestart();
  }

  /* ---------- audio: synthesised, simplified ---------- */
  var AC = null, src = null, gainNode = null, startAt = 0;
  function biquadBP(f, q, sr) {
    var w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return { b0: al / a0, b1: 0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0 };
  }
  function buildBuffer() {
    var sr = AC.sampleRate, len = Math.round(T * sr), buf = AC.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var md = model(S.id, S.man), m = md.m, i, t;
    if (m.pair) {
      var c = biquadBP(m.snd.f, m.snd.q, sr), c2 = biquadBP(m.snd.f, m.snd.q, sr), x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0, seed = 12345;
      for (var pass = 0; pass < 2; pass++) for (i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647; var n = seed / 2147483647 * 2 - 1;
        var y = c.b0 * n + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = n; y2 = y1; y1 = y;
        var yy = c2.b0 * y + c2.b1 * z1 + c2.b2 * z2 - c2.a1 * w1 - c2.a2 * w2; z2 = z1; z1 = y; w2 = w1; w1 = yy;
        if (pass === 1) { t = i / sr; var k = Math.min(N - 1, Math.floor(t / T * N)); d[i] = yy * md.env[k] * m.snd.g * 3; }
      }
    }
    soundList(md).forEach(function (s) {
      var w = s.w * 1.4, i0 = Math.max(0, Math.floor((s.t - w) * sr)), i1 = Math.min(len, Math.ceil((s.t + w) * sr));
      for (i = i0; i < i1; i++) {
        t = i / sr; var u = (t - (s.t - w)) / (2 * w), win = Math.sin(Math.PI * u);
        d[i] += s.a * win * win * (0.6 * Math.sin(2 * Math.PI * s.f * t) + 0.4 * Math.sin(2 * Math.PI * s.f * 2.3 * t));
      }
    });
    var pk = 0; for (i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    if (pk > 0) for (i = 0; i < len; i++) d[i] = d[i] / pk * 0.85;
    return buf;
  }
  function audioStart(offset) {
    if (!AC) { var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) { status("Sound is not supported in this browser."); return false; } AC = new Ctx(); }
    if (AC.state === "suspended") AC.resume();
    gainNode = gainNode || AC.createGain(); gainNode.gain.value = 0.7; gainNode.connect(AC.destination);
    src = AC.createBufferSource(); src.buffer = buildBuffer(); src.loop = true; src.connect(gainNode);
    offset = offset || 0; src.start(0, offset); startAt = AC.currentTime - offset;
    return true;
  }
  function audioStop() { if (src) { try { src.stop(); } catch (e) { /* already stopped */ } src.disconnect(); src = null; } }
  function audioRestart() { var off = AC ? ((AC.currentTime - startAt) % T) : 0; audioStop(); audioStart(off); }
  function setPlaying(on) {
    if (on && !audioStart(0)) on = false;
    if (!on) audioStop();
    S.playing = on;
    var b = $("playBtn"); b.setAttribute("aria-pressed", String(on));
    b.querySelector(".mm-play-text").textContent = on ? "Stop sound" : "Play sound";
    loop();
  }
  var t0 = performance.now(), raf = null;
  function phase() { if (S.playing && AC) return ((AC.currentTime - startAt) % T) / T; return (((performance.now() - t0) / 1000) % T) / T; }
  function loop() {
    var ph = $("mmPlayhead");
    if (ph) ph.setAttribute("visibility", (S.playing || S.anim) ? "visible" : "hidden");
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (!(S.playing || S.anim) || !geo) return;
    (function step() {
      var p = $("mmPlayhead"); if (p && geo) p.setAttribute("transform", "translate(" + geo.x(phase() * T).toFixed(1) + ",0)");
      raf = requestAnimationFrame(step);
    })();
  }
  function setAnim(on) {
    S.anim = on; var b = $("animSwitch"); b.setAttribute("aria-checked", String(on)); $("animState").textContent = on ? "on" : "off"; loop();
  }
  function status(msg) { var s = $("mmStatus"); s.hidden = !msg; s.textContent = msg || ""; }

  /* ---------- Test yourself ---------- */
  var POOL = ["as", "mr", "tr", "vsd", "hocm", "innocent", "ar", "ms"];
  var CLUE = { as: "squat", mr: "handgrip", tr: "insp", vsd: "handgrip", hocm: "valsalva", innocent: "valsalva", ar: "handgrip", ms: "squat" };
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function newQuestion() {
    var q = S.test, id = q.order[q.i], opts = shuffle(POOL.filter(function (x) { return x !== id; })).slice(0, 3).concat([id]);
    q.opts = shuffle(opts); q.answered = false; q.choice = null; q.id = id;
    S.id = id; S.man = "rest";
  }
  function startTest() {
    S.test = { order: shuffle(POOL), i: 0, score: 0, done: 0 };
    newQuestion();
    $("testBanner").classList.add("is-on");
    var b = $("testToggle"); b.setAttribute("aria-pressed", "true"); b.querySelector(".test-cta-label").textContent = "Stop"; b.setAttribute("aria-label", "Stop Test yourself");
    $("toolControls").classList.add("is-testing");
    updateScore(); refresh(); status("Test yourself: the pressure traces are hidden until you answer.");
    var p = $("explainPanel"); p.setAttribute("tabindex", "-1"); p.focus({ preventScroll: false });
  }
  function stopTest() {
    S.test = null; $("testBanner").classList.remove("is-on");
    var b = $("testToggle"); b.setAttribute("aria-pressed", "false"); b.querySelector(".test-cta-label").textContent = "Start"; b.setAttribute("aria-label", "Start Test yourself");
    $("toolControls").classList.remove("is-testing"); $("testBannerScore").hidden = true; status(""); refresh();
  }
  function updateScore() { var s = $("testBannerScore"); s.hidden = !S.test; if (S.test) s.textContent = "Score " + S.test.score + " / " + S.test.done; }
  function testHTML() {
    var q = S.test;
    if (q.i >= q.order.length) return '<p class="explain-kicker">Test yourself!</p><h2 class="explain-title">Finished</h2><p class="predict-score">You scored ' + q.score + " out of " + q.order.length + '.</p><div class="predict-actions"><button type="button" id="tqRestart">Try again</button><button type="button" class="secondary" id="tqExit">Back to exploring</button></div>';
    var m = M[q.id], cm = CLUE[q.id], ce = m.eff[cm], cl = MANS.filter(function (x) { return x.id === cm; })[0].label;
    var h = '<p class="explain-kicker">Test yourself! Question ' + (q.i + 1) + " of " + q.order.length + "</p>";
    h += '<h2 class="explain-title">Which murmur is this?</h2>';
    h += '<p class="predict-score">Score ' + q.score + " / " + q.done + "</p>";
    h += '<div class="panel-block"><h3>Clues</h3><ul><li><strong>Loudest:</strong> ' + esc(m.where) + "</li><li><strong>Radiation:</strong> " + esc(m.radiation) + "</li><li><strong>" + esc(cl) + ":</strong> " + esc(EFF_WORD[ce[0]].toLowerCase()) + "</li></ul><p>Look at the phonocardiogram, and press Play sound to hear the simplified version.</p></div>";
    h += '<div class="predict-q"><p id="tq-label">Choose one</p><div class="predict-opts" role="group" aria-labelledby="tq-label">';
    q.opts.forEach(function (o) {
      var mark = "", cls = "", verdict = "", aria = M[o].name;
      if (q.answered) {
        if (o === q.id) { cls = "is-correct"; mark = "\u2713"; verdict = '<span class="predict-verdict">' + (q.choice === o ? "Correct" : "Correct answer") + "</span>"; aria += q.choice === o ? " (Correct)" : " (Correct answer)"; }
        else if (o === q.choice) { cls = "is-wrong"; mark = "\u2717"; verdict = '<span class="predict-verdict">Not quite</span>'; aria += " (Not quite)"; }
      }
      h += '<button type="button" class="' + cls + '" data-opt="' + o + '" aria-pressed="' + (q.choice === o) + '"' + (q.answered ? ' aria-disabled="true"' : "") + ' aria-label="' + esc(aria) + '"><span class="predict-mark" aria-hidden="true">' + mark + '</span><span class="predict-opt-text">' + esc(M[o].name) + verdict + "</span></button>";
    });
    h += "</div></div>";
    if (q.answered) {
      h += '<div class="panel-block"><h3>' + (q.choice === q.id ? "Correct" : "Not quite: it is " + esc(m.name.toLowerCase())) + "</h3><p><strong>" + esc(m.timing) + ".</strong> " + esc(m.why) + "</p></div>";
      h += '<div class="predict-actions"><button type="button" id="tqNext">' + (q.i + 1 < q.order.length ? "Next" : "See score") + '</button><button type="button" class="secondary" id="tqExit">Stop</button></div>';
    }
    return h;
  }
  function bindTest() {
    var p = $("explainPanel");
    p.querySelectorAll("[data-opt]").forEach(function (b) {
      b.addEventListener("click", function () {
        var q = S.test; if (q.answered) return;
        q.choice = b.getAttribute("data-opt"); q.answered = true; q.done++; if (q.choice === q.id) q.score++;
        updateScore(); render(); renderExplain(); status("");
        var n = $("tqNext"); if (n) n.focus();
      });
    });
    var nx = $("tqNext"); if (nx) nx.addEventListener("click", function () { S.test.i++; if (S.test.i < S.test.order.length) { newQuestion(); status("Test yourself: the pressure traces are hidden until you answer."); } refresh(); var f = p.querySelector("[data-opt]") || $("tqRestart"); if (f) f.focus(); });
    var ex = $("tqExit"); if (ex) ex.addEventListener("click", stopTest);
    var rs = $("tqRestart"); if (rs) rs.addEventListener("click", startTest);
  }

  /* ---------- revise: vivas, numbers, tabs ---------- */
  var VIVAS = [
    ["What makes a murmur, and why does its timing tell you the lesion?", "Turbulent flow through a narrowed or leaking valve or defect. Flow, and so the murmur, only happens while a pressure gradient drives blood across the lesion, so the murmur sits wherever that gradient exists in the cardiac cycle: LV above aorta during ejection in aortic stenosis, LV above left atrium throughout systole in mitral regurgitation."],
    ["Why is the murmur of aortic stenosis crescendo-decrescendo, and why does it end before S2?", "The gradient between the LV and the aorta rises and falls with ejection. Once ejection stops, there is no forward flow, so the murmur stops before the aortic valve closes."],
    ["Why is mitral regurgitation pansystolic?", "LV pressure is above left atrial pressure from the moment the mitral valve should close (S1) until after the aortic valve closes (S2), so regurgitant flow, and the murmur, lasts the whole of systole."],
    ["Which signs suggest severe aortic stenosis?", "Soft or absent A2, a late-peaking murmur, a slow-rising pulse and a narrow pulse pressure. Loudness alone is not a good guide, because a failing ventricle generates less flow."],
    ["Describe the murmur of mitral stenosis and how you would bring it out.", "Loud S1, an opening snap after S2, then a low-pitched mid-diastolic rumble at the apex, with presystolic accentuation in sinus rhythm. Listen with the bell, with the patient on their left side, in expiration; exercise makes it easier to hear. A shorter S2 to opening snap interval suggests more severe stenosis."],
    ["How do you tell a right-sided murmur from a left-sided one at the bedside?", "Right-sided murmurs get louder on inspiration (Carvallo's sign in tricuspid regurgitation) because venous return to the right heart rises. Left-sided murmurs are louder in expiration."],
    ["Why does the HOCM murmur get louder with Valsalva, when most murmurs get softer?", "Valsalva reduces preload, so the ventricle is smaller and the outflow tract narrower, which increases the dynamic obstruction. Squatting or handgrip increase preload or afterload and make it softer."],
    ["What features suggest a murmur is innocent?", "Soft (grade 1 to 2), short, systolic, no radiation, normal heart sounds, no thrill and no symptoms. Diastolic murmurs, loud murmurs or a thrill, symptoms, or abnormal heart sounds need investigating."]
  ];
  var NUMS = [
    ["Aortic pressure", "About 120 / 80 mmHg", "Guyton and Hall, Ch. 9"],
    ["Pulmonary artery pressure", "About 25 / 8 mmHg", "Guyton and Hall, pulmonary circulation chapter"],
    ["Right ventricular systolic pressure", "About 25 mmHg", "Guyton and Hall, pulmonary circulation chapter"],
    ["Left atrial mean pressure", "About 2 mmHg (range 1 to 5) lying down", "Guyton and Hall, pulmonary circulation chapter"],
    ["Heart rate used in the drawing", "72 per minute, so one beat is about 0.83 s", "Guyton and Hall, Ch. 9"],
    ["Murmur grading (Levine)", "Grade 1 to 6; grade 4 and above has a palpable thrill", "Macleod's Clinical Examination"],
    ["Severe aortic stenosis", "Peak velocity 4 m/s or more, mean gradient 40 mmHg or more, valve area under 1.0 cm\u00b2", "ESC/EACTS 2021"],
    ["Clinically significant mitral stenosis", "Valve area 1.5 cm\u00b2 or less", "ESC/EACTS 2021"],
    ["Severe primary mitral regurgitation", "Effective regurgitant orifice area 40 mm\u00b2 or more; regurgitant volume 60 mL or more", "ESC/EACTS 2021"],
    ["Severe aortic regurgitation", "Effective regurgitant orifice area 30 mm\u00b2 or more; regurgitant volume 60 mL or more", "ESC/EACTS 2021"],
    ["HOCM outflow obstruction", "Peak gradient 30 mmHg or more; 50 mmHg or more is the usual threshold for treatment", "ESC 2023 cardiomyopathy guideline"]
  ];
  function renderRevise() {
    $("vivaList").innerHTML = VIVAS.map(function (v, i) {
      return '<details class="hy-details"><summary><span class="viva-q">' + (i + 1) + ". " + esc(v[0]) + '</span></summary><div class="details-body viva-a">' + esc(v[1]) + "</div></details>";
    }).join("");
    $("numsWrap").innerHTML = '<table class="nums-table"><caption class="visually-hidden">Key numbers for heart pressures and murmurs, with sources</caption><thead><tr><th scope="col">Item</th><th scope="col">Value</th></tr></thead><tbody>' +
      NUMS.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th><td><div class="val">' + esc(r[1]) + '</div><div class="src">' + esc(r[2]) + "</div></td></tr>"; }).join("") + "</tbody></table>";
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.revise-tabs [role="tab"]'));
    function act(tab, focus) {
      tabs.forEach(function (t) { var on = t === tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; $(t.getAttribute("aria-controls")).hidden = !on; });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { act(t, false); });
      t.addEventListener("keydown", function (e) {
        var j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length; else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length; else if (e.key === "Home") j = 0; else if (e.key === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); act(tabs[j], true); }
      });
    });
  }

  /* ---------- init ---------- */
  function init() {
    renderControls(); render(); renderExplain(); renderRevise();
    $("playBtn").addEventListener("click", function () { setPlaying(!S.playing); });
    $("animSwitch").addEventListener("click", function () { setAnim(!S.anim); });
    $("testToggle").addEventListener("click", function () { if (S.test) stopTest(); else startTest(); });
    document.querySelectorAll(".try-btn[data-murmur]").forEach(function (b) {
      b.addEventListener("click", function () { S.id = b.getAttribute("data-murmur"); S.man = b.getAttribute("data-man"); refresh(); });
    });
    var rt = null;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { render(); loop(); }, 120); });
    window.addEventListener("themechange", function () { render(); renderExplain(); loop(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && S.playing) setPlaying(false); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.MurmurTool = { model: model, M: M, T: T, N: N, state: S, render: render };
})();
