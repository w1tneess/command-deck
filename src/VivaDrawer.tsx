import { useEffect, useState } from "react";
import type { Act, Chapter, Subject } from "./api.ts";
import { AppleEmoji, Btn, ConfDots, ICONS, Icon, PASS_NAMES, PASS_SHORT, Pill } from "./ui.tsx";

type Flashcard = {
  question: string;
  answer: string;
  keywords: string[];
  boardYear?: string;
};

type ChapterStudyKit = {
  summary: string;
  formulas: { title: string; detail: string }[];
  keywords: string[];
  cards: Flashcard[];
};

/** Curated CBSE Class 10 High-Yield Knowledge Base for Science, Maths & Core Subjects */
export const VIVA_DATABASE: Record<string, ChapterStudyKit> = {
  // --- SCIENCE ---
  "Chemical Reactions and Equations": {
    summary: "Law of conservation of mass, balancing equations, redox reactions, corrosion and rancidity.",
    formulas: [
      { title: "Rusting of Iron", detail: "4Fe + 3O₂ + 2xH₂O → 2Fe₂O₃·xH₂O (hydrated ferric oxide)" },
      { title: "Slaking of Lime", detail: "CaO (quicklime) + H₂O → Ca(OH)₂ (slaked lime) + Heat (Exothermic)" },
      { title: "Limewater Test", detail: "Ca(OH)₂ + CO₂ → CaCO₃ ↓ (milky white ppt) + H₂O" },
    ],
    keywords: ["Precipitation", "Exothermic", "Endothermic", "Oxidizing Agent", "Reducing Agent", "Antioxidants"],
    cards: [
      {
        question: "Why does the colour of copper sulphate solution change when an iron nail is dipped in it?",
        answer: "Iron is more reactive than copper (higher in the reactivity series). It displaces copper from CuSO₄ to form greenish FeSO₄ solution and deposits brown copper metal on the nail: Fe + CuSO₄ → FeSO₄ + Cu.",
        keywords: ["Reactivity series", "Displacement reaction", "FeSO₄ pale green"],
        boardYear: "CBSE 2023, 2020",
      },
      {
        question: "What is a redox reaction? Identify the substance oxidized and reduced in: MnO₂ + 4HCl → MnCl₂ + 2H₂O + Cl₂.",
        answer: "A reaction where oxidation and reduction occur simultaneously. Here: HCl is oxidized to Cl₂ (loss of hydrogen), and MnO₂ is reduced to MnCl₂ (loss of oxygen). MnO₂ is the oxidizing agent; HCl is the reducing agent.",
        keywords: ["Loss of oxygen", "Oxidizing agent: MnO₂", "Reducing agent: HCl"],
        boardYear: "CBSE 2024, 2019",
      },
      {
        question: "Why should a magnesium ribbon be cleaned with sandpaper before burning in air?",
        answer: "Magnesium reacts slowly with atmospheric oxygen to form a stable protective layer of basic magnesium oxide (MgO) on its surface, which prevents ignition. Sandpaper removes this layer so it burns smoothly with a dazzling white flame.",
        keywords: ["Basic magnesium oxide", "Protective layer", "Dazzling white flame"],
        boardYear: "CBSE 2022, 2018",
      },
    ],
  },
  "Acids, Bases and Salts": {
    summary: "Arrhenius ions (H⁺/OH⁻), indicators, pH scale, preparation and uses of Bleaching Powder, Baking Soda, Washing Soda, and Plaster of Paris.",
    formulas: [
      { title: "Bleaching Powder", detail: "Ca(OH)₂ + Cl₂ → CaOCl₂ + H₂O" },
      { title: "Baking Soda", detail: "NaCl + H₂O + CO₂ + NH₃ → NH₄Cl + NaHCO₃" },
      { title: "Plaster of Paris", detail: "CaSO₄·2H₂O (Gypsum, 373 K) → CaSO₄·½H₂O (POP) + 1½H₂O" },
    ],
    keywords: ["Water of crystallization", "Chlor-alkali process", "Amphoteric", "Neutralization", "POP"],
    cards: [
      {
        question: "What is the Chlor-alkali process? State products formed at the anode and cathode.",
        answer: "Electrolysis of aqueous sodium chloride (brine): 2NaCl + 2H₂O → 2NaOH + Cl₂ + H₂. Anode (+) produces Chlorine gas (Cl₂). Cathode (-) produces Hydrogen gas (H₂). Sodium hydroxide (NaOH) solution forms near the cathode.",
        keywords: ["Anode: Cl₂", "Cathode: H₂", "Near cathode: NaOH"],
        boardYear: "CBSE 2024, 2020",
      },
      {
        question: "Why does dry HCl gas not turn dry blue litmus paper red?",
        answer: "Acids only produce hydrogen/hydronium ions (H⁺/H₃O⁺) in the presence of water. Without water, dry HCl does not dissociate into H⁺ ions, hence it cannot exhibit acidic properties to change litmus color.",
        keywords: ["H⁺ / H₃O⁺ ions", "Aqueous dissociation", "Dry state has no ions"],
        boardYear: "CBSE 2023, 2021",
      },
      {
        question: "Why is plaster of Paris stored in a moisture-proof container?",
        answer: "POP (CaSO₄·½H₂O) readily absorbs atmospheric moisture and sets into a hard solid mass called Gypsum (CaSO₄·2H₂O), losing its setting properties.",
        keywords: ["Absorbs water", "Converts to Gypsum", "Hard mass"],
        boardYear: "CBSE 2020",
      },
    ],
  },
  "Life Processes": {
    summary: "Autotrophic & heterotrophic nutrition, stomatal mechanics, human digestion, double circulation, nephron structure & urine formation.",
    formulas: [
      { title: "Photosynthesis Equation", detail: "6CO₂ + 12H₂O (Chlorophyll, Sunlight) → C₆H₁₂O₆ + 6O₂ + 6H₂O" },
      { title: "Aerobic Respiration", detail: "Glucose → Pyruvate (Cytoplasm) → 6CO₂ + 6H₂O + 38 ATP (Mitochondria)" },
      { title: "Anaerobic (Yeast)", detail: "Glucose → Pyruvate → Ethanol + CO₂ + 2 ATP" },
    ],
    keywords: ["Peristalsis", "Emulsification", "Nephron", "Ultrafiltration", "Double circulation", "Transpiration pull"],
    cards: [
      {
        question: "Describe the three events that occur during photosynthesis.",
        answer: "1. Absorption of light energy by chlorophyll.\n2. Conversion of light energy to chemical energy and splitting of water molecules into hydrogen and oxygen (photolysis).\n3. Reduction of carbon dioxide to carbohydrates.",
        keywords: ["Photolysis of water", "Absorption by chlorophyll", "Reduction of CO₂"],
        boardYear: "CBSE 2024, 2022",
      },
      {
        question: "Why is double circulation necessary in human beings and birds?",
        answer: "Double circulation keeps oxygenated and deoxygenated blood completely separated. This ensures an efficient supply of oxygen to body cells, which is essential to meet high energy needs for maintaining constant body temperature (warm-blooded organisms).",
        keywords: ["Complete separation", "Oxygen efficiency", "Constant body temperature"],
        boardYear: "CBSE 2023, 2019",
      },
      {
        question: "Explain the role of bile juice in digestion.",
        answer: "1. Neutralization: It makes the acidic food coming from the stomach alkaline for pancreatic enzymes (trypsin and lipase) to act.\n2. Emulsification: Bile salts break down large fat globules into smaller droplets, significantly increasing enzyme surface area.",
        keywords: ["Alkaline medium", "Emulsification of fats", "Bile salts"],
        boardYear: "CBSE 2022, 2020",
      },
    ],
  },
  "Light – Reflection and Refraction": {
    summary: "Mirror formula, Lens formula, Snell's law, refractive index, power of lenses, sign convention.",
    formulas: [
      { title: "Mirror Formula", detail: "1/f = 1/v + 1/u, Magnification m = -v/u = h'/h" },
      { title: "Lens Formula", detail: "1/f = 1/v - 1/u, Magnification m = +v/u = h'/h" },
      { title: "Snell's Law", detail: "sin i / sin r = constant (n₂₁ = v₁ / v₂)" },
      { title: "Power of Lens", detail: "P = 1/f(in metres) [Dioptres, D]. Convex = +ve, Concave = -ve" },
    ],
    keywords: ["Cartesian Sign Convention", "Real vs Virtual", "Optical Centre", "Pole", "Total Internal Reflection"],
    cards: [
      {
        question: "State the laws of refraction of light (Snell's Law).",
        answer: "1. The incident ray, the refracted ray and the normal to the interface of two transparent media at the point of incidence all lie in the same plane.\n2. The ratio of sine of angle of incidence to the sine of angle of refraction is a constant for the light of a given colour and pair of media: sin(i) / sin(r) = n₂₁.",
        keywords: ["Same plane", "sin i / sin r = constant", "Refractive index"],
        boardYear: "CBSE 2024, 2023",
      },
      {
        question: "Where should an object be placed in front of a concave mirror to get a virtual and magnified image?",
        answer: "Between the Pole (P) and Principal Focus (F). The image formed is behind the mirror, virtual, erect, and magnified. Used as shaving and dentist mirrors.",
        keywords: ["Between P and F", "Behind the mirror", "Dentist mirror"],
        boardYear: "CBSE 2022, 2019",
      },
      {
        question: "A doctor prescribes a corrective lens of power -2.0 D. Find the focal length of the lens. Is it converging or diverging?",
        answer: "f = 1/P = 1 / (-2.0 D) = -0.5 m = -50 cm. Since focal length and power are negative, it is a diverging lens (Concave lens) used to correct Myopia.",
        keywords: ["f = -0.5 m (-50 cm)", "Concave / Diverging lens", "Corrects Myopia"],
        boardYear: "CBSE 2023",
      },
    ],
  },
  "Electricity": {
    summary: "Ohm's Law, factors affecting resistance, series vs parallel circuits, Joule's law of heating, electric power.",
    formulas: [
      { title: "Ohm's Law", detail: "V = IR (at constant temperature)" },
      { title: "Resistivity", detail: "R = ρ·(l / A), where ρ is resistivity (Ω·m)" },
      { title: "Joule's Heating", detail: "H = I²Rt = VIt = (V²/R)·t (Joules)" },
      { title: "Electric Power", detail: "P = VI = I²R = V²/R (Watts, 1 kWh = 3.6 × 10⁶ J)" },
    ],
    keywords: ["Resistivity", "Ammeter in series", "Voltmeter in parallel", "Joule's Law", "1 kWh = 3.6 MJ"],
    cards: [
      {
        question: "Why are domestic circuits connected in parallel rather than series?",
        answer: "1. Independent operation: If one appliance fails or is switched off, others continue to work.\n2. Equal voltage: Every appliance receives full mains voltage (220 V).\n3. Lower total resistance: Overall circuit resistance decreases, allowing sufficient current for each device.",
        keywords: ["Equal voltage (220V)", "Independent switches", "Lower equivalent resistance"],
        boardYear: "CBSE 2024, 2020",
      },
      {
        question: "State Joule's law of heating and write its mathematical expression.",
        answer: "The heat produced in a resistor is directly proportional to:\n1. The square of current for a given resistance (H ∝ I²)\n2. The resistance for a given current (H ∝ R)\n3. The time for which current flows (H ∝ t)\nFormula: H = I²Rt.",
        keywords: ["H = I²Rt", "Directly proportional to I²", "Joule heat"],
        boardYear: "CBSE 2023, 2021",
      },
    ],
  },

  // --- MATHEMATICS ---
  "Real Numbers": {
    summary: "Fundamental Theorem of Arithmetic, proving irrationality of √2, √3, √5, prime factorization LCM and HCF relation.",
    formulas: [
      { title: "HCF × LCM Rule", detail: "HCF(a, b) × LCM(a, b) = a × b (for two positive integers only)" },
      { title: "Fundamental Theorem", detail: "Every composite number can be uniquely expressed as a product of primes, apart from the order." },
    ],
    keywords: ["Irrationality by contradiction", "Co-prime integers", "Prime factorization", "HCF × LCM = a × b"],
    cards: [
      {
        question: "State the Fundamental Theorem of Arithmetic and explain why 6ⁿ cannot end with digit 0.",
        answer: "FTA states every composite number is uniquely factorable into primes. A number ends in 0 only if its prime factors include both 2 and 5 (i.e. 2 × 5). Prime factorization of 6ⁿ = (2 × 3)ⁿ. Since 5 is not in the prime factorization, by uniqueness of FTA, 6ⁿ can never end with 0.",
        keywords: ["Prime 5 missing", "6ⁿ = (2 × 3)ⁿ", "Uniqueness of FTA"],
        boardYear: "CBSE 2024, 2020",
      },
      {
        question: "Outline the proof that √5 is irrational.",
        answer: "Assume √5 = a/b (a, b are co-prime integers, b ≠ 0). 5b² = a² ⇒ 5 divides a² ⇒ 5 divides a. Let a = 5c ⇒ 5b² = 25c² ⇒ b² = 5c² ⇒ 5 divides b² ⇒ 5 divides b. Thus 5 is a common factor of both a and b, contradicting our assumption that a and b are co-prime. Hence √5 is irrational.",
        keywords: ["Proof by contradiction", "Co-prime assumption", "5 divides both a and b"],
        boardYear: "CBSE 2023, 2021, 2019",
      },
    ],
  },
  "Polynomials": {
    summary: "Geometrical meaning of zeroes, relation between zeroes and coefficients of quadratic polynomials.",
    formulas: [
      { title: "Sum of Zeroes", detail: "α + β = -b/a = -(coefficient of x)/(coefficient of x²)" },
      { title: "Product of Zeroes", detail: "α·β = c/a = (constant term)/(coefficient of x²)" },
      { title: "Quadratic Polynomial", detail: "k · [x² - (α + β)x + αβ]" },
    ],
    keywords: ["Parabola", "Discriminant", "Zeroes as x-intercepts", "α + β = -b/a"],
    cards: [
      {
        question: "If α and β are zeroes of p(x) = ax² + bx + c, write the relationship between zeroes and coefficients.",
        answer: "1. Sum of zeroes: α + β = -b/a = -(coefficient of x) / (coefficient of x²)\n2. Product of zeroes: α·β = c/a = (constant term) / (coefficient of x²).",
        keywords: ["α + β = -b/a", "αβ = c/a", "Coefficients"],
        boardYear: "CBSE 2024, 2022",
      },
      {
        question: "Find a quadratic polynomial whose zeroes are (3 + √2) and (3 - √2).",
        answer: "Sum: S = (3 + √2) + (3 - √2) = 6.\nProduct: P = (3 + √2)(3 - √2) = 3² - (√2)² = 9 - 2 = 7.\nPolynomial: p(x) = x² - Sx + P = x² - 6x + 7.",
        keywords: ["S = 6", "P = 7", "x² - 6x + 7"],
        boardYear: "CBSE 2020",
      },
    ],
  },
  "Introduction to Trigonometry": {
    summary: "Trigonometric ratios, values for specific angles (0°, 30°, 45°, 60°, 90°), fundamental trigonometric identities.",
    formulas: [
      { title: "Pythagorean Identities", detail: "sin²θ + cos²θ = 1;  1 + tan²θ = sec²θ;  1 + cot²θ = cosec²θ" },
      { title: "Quotient Relations", detail: "tan θ = sin θ / cos θ;  cot θ = cos θ / sin θ" },
      { title: "Key Angle Values", detail: "sin 30° = 1/2, sin 45° = 1/√2, sin 60° = √3/2, tan 45° = 1, tan 30° = 1/√3" },
    ],
    keywords: ["sin²θ + cos²θ = 1", "sec²θ - tan²θ = 1", "cosec²θ - cot²θ = 1", "Adjacent/Hypotenuse"],
    cards: [
      {
        question: "Prove the identity: (sin θ - 2 sin³ θ) / (2 cos³ θ - cos θ) = tan θ.",
        answer: "LHS = sin θ(1 - 2 sin² θ) / [cos θ(2 cos² θ - 1)]\n= tan θ · [(cos² θ + sin² θ - 2 sin² θ) / (2 cos² θ - (cos² θ + sin² θ))]\n= tan θ · [(cos² θ - sin² θ) / (cos² θ - sin² θ)] = tan θ = RHS. Q.E.D.",
        keywords: ["Factor out sin θ and cos θ", "Replace 1 with cos²θ + sin²θ", "Cancel numerator and denominator"],
        boardYear: "CBSE 2024, 2023, 2018",
      },
      {
        question: "If sin(A - B) = 1/2 and cos(A + B) = 1/2, 0° < A + B ≤ 90°, A > B, find A and B.",
        answer: "sin(A - B) = 1/2 ⇒ A - B = 30° ...(1)\ncos(A + B) = 1/2 ⇒ A + B = 60° ...(2)\nAdding (1) and (2): 2A = 90° ⇒ A = 45°.\nSubstitute A in (2): 45° + B = 60° ⇒ B = 15°.\nAnswer: A = 45°, B = 15°.",
        keywords: ["A - B = 30°", "A + B = 60°", "A = 45°, B = 15°"],
        boardYear: "CBSE 2022, 2019",
      },
    ],
  },
};

/** Generate dynamic study kit fallback for any chapter not pre-compiled in database */
function getKitForChapter(chapter: Chapter, subject: Subject): ChapterStudyKit {
  // Check exact match or partial match
  for (const [key, kit] of Object.entries(VIVA_DATABASE)) {
    if (chapter.name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(chapter.name.toLowerCase())) {
      return kit;
    }
  }

  // Fallback kit structured for CBSE 10
  return {
    summary: `CBSE Class 10 ${subject.name} syllabus chapter: "${chapter.name}". Focus on high-yield NCERT definitions, board derivations, and PYQ patterns.`,
    formulas: [
      { title: "Key Definition / Law", detail: `State the fundamental theorem or standard scientific principle governing ${chapter.name}.` },
      { title: "Standard Application", detail: `Identify the 3-mark and 5-mark long question application cases from NCERT exemplar.` },
    ],
    keywords: ["NCERT Terminology", "Keyword Precision", "Board Marking Scheme", "Direct Application"],
    cards: [
      {
        question: `What are the core concepts and fundamental definitions in "${chapter.name}"?`,
        answer: `Review the summary points at the end of the NCERT chapter for "${chapter.name}". Ensure all technical terms, diagrams, and formulas are written with exact board terminology.`,
        keywords: ["NCERT Summary", "Definitions", "Diagram accuracy"],
        boardYear: "CBSE High-Frequency",
      },
      {
        question: `What is the most frequently asked 3-mark / 5-mark board question in ${chapter.name}?`,
        answer: `Examine the past 5 years of CBSE board question papers (PYQs). Pay close attention to step-by-step marking rubrics, given statements, and concluding units.`,
        keywords: ["Past 5-year PYQs", "Step marking", "Units & diagrams"],
        boardYear: "Pre-Boards & Boards",
      },
    ],
  };
}

export function VivaDrawer({
  chapter,
  subject,
  act,
  onClose,
}: {
  chapter: Chapter;
  subject: Subject;
  act: Act;
  onClose: () => void;
}) {
  const kit = getKitForChapter(chapter, subject);
  const [tab, setTab] = useState<"quiz" | "cheatsheet">("quiz");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeFeedback, setGradeFeedback] = useState("");

  const currentCard = kit.cards[cardIndex] ?? kit.cards[0];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") nextCard();
      if (e.key === "ArrowLeft") prevCard();
      if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault();
        setRevealed((r) => !r);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cardIndex, kit.cards.length]);

  const nextCard = () => {
    setRevealed(false);
    setCardIndex((i) => (i + 1) % kit.cards.length);
  };

  const prevCard = () => {
    setRevealed(false);
    setCardIndex((i) => (i - 1 + kit.cards.length) % kit.cards.length);
  };

  const handleGrade = async (conf: number, label: string) => {
    setSavingGrade(true);
    setGradeFeedback(`Marked as ${label}`);
    await act("PATCH", `/api/chapters/${chapter.id}`, { confidence: conf });
    setSavingGrade(false);
    setTimeout(() => setGradeFeedback(""), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="viva-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-xs p-0 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-full w-full max-w-xl flex-col rounded-l-[28px] sm:rounded-l-[32px] border-l border-black/[0.08] bg-[#faf7f2] text-zinc-900 shadow-2xl overflow-hidden animate-drawer-desktop paper">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4 bg-white/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-900 border border-amber-200 shadow-xs">
              <AppleEmoji emoji="⚡" size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-sans text-xs font-semibold   text-zinc-500">
                  {subject.name} · Active Recall
                </span>
                <span className="text-zinc-400 font-mono text-[11px]">/</span>
                <span className="font-sans text-xs  text-zinc-500">Class 10 CBSE</span>
              </div>
              <h2 id="viva-title" className="m-0 text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
                {chapter.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-black/[0.06] bg-[#f4efe8] px-3 py-1.5 paper">
              <span className="font-sans text-xs font-medium text-zinc-600">Confidence:</span>
              <ConfDots value={chapter.confidence} />
            </div>
            <button
              type="button"
              aria-label="Close viva modal"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-zinc-700 hover:bg-zinc-900 hover:text-white transition-all shadow-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex border-b border-black/[0.06] bg-[#f4efe8]/60 px-6 gap-2 pt-2 pb-0 paper">
          <button
            type="button"
            onClick={() => setTab("quiz")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold tracking-wide transition-all ${
              tab === "quiz"
                ? "border-zinc-950 text-zinc-950 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Flashcards ({kit.cards.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("cheatsheet")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold tracking-wide transition-all ${
              tab === "cheatsheet"
                ? "border-zinc-950 text-zinc-950 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Formulas & Keywords
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#faf7f2] paper">
          {tab === "quiz" ? (
            <div className="flex flex-col gap-4">
              {/* Flashcard Header & Progress */}
              <div className="flex items-center justify-between text-xs font-mono  text-zinc-500">
                <span>QUESTION {String(cardIndex + 1).padStart(2, "0")} OF {String(kit.cards.length).padStart(2, "0")}</span>
                {currentCard.boardYear && (
                  <span className="rounded-full border border-amber-300 bg-[#fee2be] px-2.5 py-0.5 text-amber-950 font-sans text-xs font-semibold shadow-2xs paper">
                    ★ {currentCard.boardYear}
                  </span>
                )}
              </div>

              {/* Flashcard Body */}
              <div
                tabIndex={0}
                role="button"
                aria-label={revealed ? "Answer revealed. Click to hide." : "Question card. Click to reveal answer."}
                onClick={() => setRevealed((r) => !r)}
                className="group relative flex min-h-[220px] cursor-pointer flex-col justify-between rounded-3xl border border-black/[0.06] bg-white p-6 shadow-sm hover:border-black/20 transition-all text-zinc-900"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="font-mono text-[11px] font-semibold   text-zinc-400">
                      Prompt Spec
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span className="font-mono text-[11px] text-zinc-500">Click or Space to flip</span>
                  </div>
                  <p className="m-0 text-base sm:text-[17px] font-semibold leading-relaxed text-zinc-900">
                    {currentCard.question}
                  </p>
                </div>

                {revealed ? (
                  <div className="mt-5 border-t border-black/[0.06] pt-4.5 animate-fade-in">
                    <div className="font-sans text-xs font-bold   text-emerald-800 mb-2 flex items-center gap-1.5">
                      <span>✓ Examiner Model Answer & PYQ Rubric</span>
                    </div>
                    <div className="rounded-2xl bg-[#c8f0d8]/35 border border-emerald-200/60 p-4 text-emerald-950 paper">
                      <p className="m-0 text-sm leading-relaxed whitespace-pre-line font-sans font-medium">
                        {currentCard.answer}
                      </p>
                      {currentCard.keywords && currentCard.keywords.length > 0 && (
                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                          {currentCard.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded-full border border-emerald-300 bg-white px-2.5 py-0.5 font-sans text-xs font-semibold text-emerald-900 shadow-2xs"
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center justify-between font-sans text-xs text-zinc-500 border-t border-black/[0.04] pt-3">
                    <span className="group-hover:text-zinc-900 transition-colors font-medium">
                      Click to reveal examiner answer
                    </span>
                    <span className="text-zinc-400   text-[11px] font-mono">Flip Card ↵</span>
                  </div>
                )}
              </div>

              {/* Card Navigation Controls */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={kit.cards.length <= 1}
                  onClick={prevCard}
                  aria-label="Previous question flashcard"
                  className="flex h-10 items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-950 hover:text-white disabled:opacity-30 transition-all tracking-wide cursor-pointer shadow-xs active:scale-95"
                >
                  ← Prev
                </button>

                <button
                  type="button"
                  onClick={() => setRevealed((r) => !r)}
                  aria-label={revealed ? "Hide examiner model answer" : "Reveal examiner model answer"}
                  className="flex h-10 items-center justify-center rounded-full border border-transparent bg-zinc-950 px-5 text-xs font-semibold text-white hover:bg-zinc-800 transition-all tracking-wide shadow-sm cursor-pointer active:scale-95"
                >
                  {revealed ? "Hide Answer" : "Reveal Answer"}
                </button>

                <button
                  type="button"
                  disabled={kit.cards.length <= 1}
                  onClick={nextCard}
                  aria-label="Next question flashcard"
                  className="flex h-10 items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-950 hover:text-white disabled:opacity-30 transition-all tracking-wide cursor-pointer shadow-xs active:scale-95"
                >
                  Next →
                </button>
              </div>

              {/* 3-Point Self-Grade Scale to Auto-Update Confidence */}
              <div className="mt-2 rounded-3xl border border-black/[0.06] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-sans text-xs font-semibold   text-zinc-500">
                    Self-Evaluation & Confidence
                  </span>
                  {gradeFeedback && (
                    <span className="font-sans text-xs font-bold text-emerald-700 animate-fade-in">
                      ✓ {gradeFeedback}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={savingGrade}
                    onClick={() => handleGrade(1, "Needs Work (Confidence 1)")}
                    aria-label={`Grade confidence 1: Needs Work for ${chapter.name}`}
                    className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/70 p-2.5 hover:bg-rose-100 transition-all cursor-pointer active:scale-95"
                  >
                    <span className="font-sans text-xs font-bold text-rose-800 ">[1] Needs Work</span>
                    <span className="font-mono text-[11px] text-rose-600   mt-0.5">Conf 1 · Review</span>
                  </button>

                  <button
                    type="button"
                    disabled={savingGrade}
                    onClick={() => handleGrade(3, "Almost Ready (Confidence 3)")}
                    aria-label={`Grade confidence 3: Almost Ready for ${chapter.name}`}
                    className="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/70 p-2.5 hover:bg-amber-100 transition-all cursor-pointer active:scale-95"
                  >
                    <span className="font-sans text-xs font-bold text-amber-800 ">[3] Almost Ready</span>
                    <span className="font-mono text-[11px] text-amber-600   mt-0.5">Conf 3 · Solid</span>
                  </button>

                  <button
                    type="button"
                    disabled={savingGrade}
                    onClick={() => handleGrade(5, "Board Ready (Confidence 5)")}
                    aria-label={`Grade confidence 5: Board Ready for ${chapter.name}`}
                    className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/70 p-2.5 hover:bg-emerald-100 transition-all cursor-pointer active:scale-95"
                  >
                    <span className="font-sans text-xs font-bold text-emerald-800 ">[5] Board Ready</span>
                    <span className="font-mono text-[11px] text-emerald-600   mt-0.5">Conf 5 · Mastered</span>
                  </button>
                </div>
              </div>

              {/* Revision Passes Toggles */}
              <div className="flex items-center justify-between rounded-3xl border border-black/[0.06] bg-white p-4 shadow-xs">
                <span className="font-sans text-xs font-semibold   text-zinc-500">Revision Passes:</span>
                <div className="flex items-center gap-1.5">
                  {PASS_NAMES.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={!!chapter.passes[i]}
                      aria-label={`Revision Pass ${i + 1}: ${name} for ${chapter.name}`}
                      onClick={() => act("PUT", `/api/chapters/${chapter.id}/passes/${i + 1}`, { done: !chapter.passes[i] })}
                      className={`h-8 rounded-full border px-3 font-mono text-xs transition-all  cursor-pointer active:scale-95 ${
                        chapter.passes[i]
                          ? "border-emerald-300 bg-[#c8f0d8] text-emerald-950 font-bold shadow-2xs paper"
                          : "border-black/[0.08] bg-[#f4efe8] text-zinc-600 hover:text-zinc-950 hover:bg-[#ece5dc] paper"
                      }`}
                    >
                      {chapter.passes[i] ? "✓ " : ""}{PASS_SHORT[i]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Cheat-sheet View */
            <div className="flex flex-col gap-4">
              <div className="rounded-3xl border border-black/[0.06] bg-white p-5 shadow-xs">
                <span className="font-sans text-xs font-semibold   text-zinc-500 block mb-1.5">
                  Chapter Blueprint
                </span>
                <p className="m-0 text-sm leading-relaxed text-zinc-800 font-medium">
                  {kit.summary}
                </p>
              </div>

              {kit.formulas.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="font-sans text-xs font-semibold   text-zinc-500">
                    Core Formulas & Laws
                  </span>
                  <div className="grid gap-2.5">
                    {kit.formulas.map((f) => (
                      <div
                        key={f.title}
                        className="rounded-2xl border border-black/[0.05] bg-white p-4 flex flex-col gap-1.5 shadow-2xs"
                      >
                        <span className="text-xs font-bold text-zinc-900 tracking-wide">
                          {f.title}
                        </span>
                        <code className="font-mono text-xs text-zinc-900 bg-[#f4efe8] rounded-xl px-3 py-2 border border-black/[0.04] block paper">
                          {f.detail}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {kit.keywords.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="font-sans text-xs font-semibold   text-zinc-500">
                    Critical Board Keywords (Mandatory in Answers)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {kit.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full border border-black/[0.08] bg-white px-3 py-1 font-sans text-xs font-semibold text-zinc-800 shadow-2xs"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black/[0.06] bg-white px-6 py-3.5 font-sans text-xs text-zinc-500">
          <span>Esc (close) · Space (flip) · Arrow Keys (nav)</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-transparent bg-zinc-950 px-4 py-1.5 font-sans text-xs font-semibold text-white hover:bg-zinc-800   transition-all cursor-pointer shadow-xs active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
