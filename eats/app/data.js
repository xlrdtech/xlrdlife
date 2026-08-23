// data.js — ported from src/lib/eats-data.ts
// Single global namespace so all babel scripts can read it.

const INGREDIENT_DB = {
  "high fructose corn syrup": { name: "High Fructose Corn Syrup", flag: "red", reason: "Insulin resistance + fatty liver" },
  "red 40": { name: "Red 40", flag: "red", reason: "Synthetic dye; behavioral concerns" },
  "yellow 5": { name: "Yellow 5", flag: "red", reason: "Synthetic dye; allergy + hyperactivity" },
  "yellow 6": { name: "Yellow 6", flag: "red", reason: "Synthetic dye; allergy flag" },
  "blue 1": { name: "Blue 1", flag: "red", reason: "Synthetic dye" },
  "bha": { name: "BHA", flag: "red", reason: "Possible carcinogen (NTP)" },
  "bht": { name: "BHT", flag: "red", reason: "Endocrine + carcinogen flag" },
  "tbhq": { name: "TBHQ", flag: "red", reason: "Petroleum-derived preservative" },
  "sodium nitrite": { name: "Sodium Nitrite", flag: "red", reason: "Forms nitrosamines when heated" },
  "partially hydrogenated": { name: "Partially Hydrogenated Oil", flag: "red", reason: "Trans fats; cardiovascular risk" },
  "aspartame": { name: "Aspartame", flag: "red", reason: "WHO 2B carcinogen" },
  "sucralose": { name: "Sucralose", flag: "red", reason: "Gut-microbiome disruption" },
  "potassium bromate": { name: "Potassium Bromate", flag: "red", reason: "Banned in EU/UK/Canada" },
  "azodicarbonamide": { name: "Azodicarbonamide", flag: "red", reason: "Banned in EU" },
  "monosodium glutamate": { name: "MSG", flag: "red", reason: "Headache + sensitivity reports" },
  "carrageenan": { name: "Carrageenan", flag: "yellow", reason: "GI inflammation in some studies" },
  "natural flavors": { name: "Natural Flavors", flag: "yellow", reason: "Vague — could be 100+ undisclosed" },
  "soybean oil": { name: "Soybean Oil", flag: "yellow", reason: "Highly processed, omega-6 heavy", allergens: ["soy"] },
  "canola oil": { name: "Canola Oil", flag: "yellow", reason: "Industrial processing" },
  "palm oil": { name: "Palm Oil", flag: "yellow", reason: "Saturated; deforestation" },
  "maltodextrin": { name: "Maltodextrin", flag: "yellow", reason: "Spikes blood sugar > sugar" },
  "soy lecithin": { name: "Soy Lecithin", flag: "yellow", reason: "Common allergen, often GMO", allergens: ["soy"] },
  "cane sugar": { name: "Cane Sugar", flag: "yellow", reason: "Added sugar — keep <25g/day" },
  "sea salt": { name: "Sea Salt", flag: "yellow", reason: "Sodium watch" },
  "wheat flour": { name: "Wheat Flour", flag: "yellow", reason: "Refined; gluten allergen", allergens: ["gluten"] },
  "milk": { name: "Milk", flag: "yellow", reason: "Dairy allergen", allergens: ["dairy"] },
  "eggs": { name: "Eggs", flag: "yellow", reason: "Common allergen", allergens: ["egg"] },
  "peanuts": { name: "Peanuts", flag: "red", reason: "Severe allergen", allergens: ["peanut"] },
  "oats": { name: "Oats", flag: "green", reason: "Beta-glucan; cholesterol support" },
  "olive oil": { name: "Olive Oil", flag: "green", reason: "Anti-inflammatory" },
  "avocado oil": { name: "Avocado Oil", flag: "green", reason: "Heart-healthy" },
  "almonds": { name: "Almonds", flag: "green", reason: "Magnesium + Vit E", allergens: ["tree-nut"] },
  "chickpeas": { name: "Chickpeas", flag: "green", reason: "Plant protein + fiber" },
  "lentils": { name: "Lentils", flag: "green", reason: "Iron + folate" },
  "quinoa": { name: "Quinoa", flag: "green", reason: "Complete protein + magnesium" },
  "spinach": { name: "Spinach", flag: "green", reason: "Iron, folate, magnesium" },
  "blueberries": { name: "Blueberries", flag: "green", reason: "Anthocyanins; brain support" },
  "sea moss": { name: "Sea Moss", flag: "green", reason: "92 minerals; alkaline staple" },
  "turmeric": { name: "Turmeric", flag: "green", reason: "Curcumin; anti-inflammatory" },
  "garlic": { name: "Garlic", flag: "green", reason: "Allicin; immune support" },
  "tahini": { name: "Tahini", flag: "green", reason: "Calcium + healthy fats" },
  "sprouted grain": { name: "Sprouted Grain", flag: "green", reason: "Higher bioavailable nutrients" },

  // Reds — additives, dyes, preservatives
  "yellow 5 lake": { name: "Yellow 5 Lake", flag: "red", reason: "Aluminum-bonded dye" },
  "yellow 6 lake": { name: "Yellow 6 Lake", flag: "red", reason: "Aluminum-bonded dye" },
  "red 3": { name: "Red 3", flag: "red", reason: "Erythrosine; FDA banned in cosmetics" },
  "blue 2": { name: "Blue 2", flag: "red", reason: "Indigotine; tumor concerns in studies" },
  "green 3": { name: "Green 3", flag: "red", reason: "Fast green FCF; tumor flag" },
  "caramel color iv": { name: "Caramel Color IV", flag: "red", reason: "4-MEI carcinogen" },
  "propyl gallate": { name: "Propyl Gallate", flag: "red", reason: "Endocrine + skin irritation" },
  "sodium benzoate": { name: "Sodium Benzoate", flag: "red", reason: "Forms benzene with vit C" },
  "potassium benzoate": { name: "Potassium Benzoate", flag: "red", reason: "Benzene formation with vit C" },
  "calcium propionate": { name: "Calcium Propionate", flag: "red", reason: "Behavioral flag in kids" },
  "sodium phosphate": { name: "Sodium Phosphate", flag: "red", reason: "Kidney + cardiovascular risk" },
  "phosphoric acid": { name: "Phosphoric Acid", flag: "red", reason: "Bone density + kidney impact" },
  "high oleic safflower": { name: "High Oleic Safflower Oil", flag: "yellow", reason: "Less inflammatory than seed oils" },
  "saccharin": { name: "Saccharin", flag: "red", reason: "Artificial sweetener; gut flora flag" },
  "acesulfame potassium": { name: "Acesulfame K", flag: "red", reason: "Artificial sweetener; insulin flag" },
  "acesulfame-k": { name: "Acesulfame K", flag: "red", reason: "Artificial sweetener; insulin flag" },
  "sodium nitrate": { name: "Sodium Nitrate", flag: "red", reason: "Cured meat carcinogen flag" },
  "potassium sorbate": { name: "Potassium Sorbate", flag: "yellow", reason: "Preservative; allergy in some" },
  "sodium aluminum phosphate": { name: "Sodium Aluminum Phosphate", flag: "red", reason: "Aluminum exposure" },
  "tert-butylhydroquinone": { name: "TBHQ", flag: "red", reason: "Petroleum-derived preservative" },
  "butylated hydroxyanisole": { name: "BHA", flag: "red", reason: "Possible carcinogen (NTP)" },
  "butylated hydroxytoluene": { name: "BHT", flag: "red", reason: "Endocrine + carcinogen flag" },
  "hydrogenated": { name: "Hydrogenated Oil", flag: "red", reason: "Trans fats; cardiovascular risk" },
  "interesterified": { name: "Interesterified Fat", flag: "red", reason: "Metabolic + insulin flag" },
  "olestra": { name: "Olestra", flag: "red", reason: "Nutrient absorption interference" },
  "brominated vegetable oil": { name: "Brominated Vegetable Oil", flag: "red", reason: "Bromine accumulation; banned in EU" },
  "bvo": { name: "Brominated Vegetable Oil", flag: "red", reason: "Bromine accumulation; banned in EU" },

  // Yellows — gums, emulsifiers, refined carbs, common allergens
  "guar gum": { name: "Guar Gum", flag: "yellow", reason: "Thickener; GI discomfort in volume" },
  "xanthan gum": { name: "Xanthan Gum", flag: "yellow", reason: "Bloating in some; corn-derived" },
  "locust bean gum": { name: "Locust Bean Gum", flag: "yellow", reason: "Thickener; legume allergy flag" },
  "gum arabic": { name: "Gum Arabic", flag: "yellow", reason: "Mostly tolerated; FODMAP" },
  "cellulose gum": { name: "Cellulose Gum", flag: "yellow", reason: "Microbiome impact in studies" },
  "modified food starch": { name: "Modified Food Starch", flag: "yellow", reason: "Often corn; processed" },
  "corn starch": { name: "Corn Starch", flag: "yellow", reason: "Refined carb; blood sugar spike" },
  "rice flour": { name: "Rice Flour", flag: "yellow", reason: "Arsenic concern; refined" },
  "tapioca starch": { name: "Tapioca Starch", flag: "yellow", reason: "Refined carb; minimal nutrients" },
  "potato starch": { name: "Potato Starch", flag: "yellow", reason: "Refined carb" },
  "enriched flour": { name: "Enriched Flour", flag: "yellow", reason: "Refined wheat; synthetic vitamins", allergens: ["gluten"] },
  "bleached flour": { name: "Bleached Flour", flag: "red", reason: "Chemical bleaching residue", allergens: ["gluten"] },
  "fructose": { name: "Fructose", flag: "yellow", reason: "Liver-only metabolism; fatty liver flag" },
  "dextrose": { name: "Dextrose", flag: "yellow", reason: "Pure glucose; blood sugar spike" },
  "corn syrup": { name: "Corn Syrup", flag: "yellow", reason: "Added sugar variant" },
  "invert sugar": { name: "Invert Sugar", flag: "yellow", reason: "Sucrose split; same impact" },
  "agave nectar": { name: "Agave Nectar", flag: "yellow", reason: "High fructose; not better than sugar" },
  "brown sugar": { name: "Brown Sugar", flag: "yellow", reason: "Added sugar with molasses" },
  "honey": { name: "Honey", flag: "yellow", reason: "Less refined sugar; still added" },
  "molasses": { name: "Molasses", flag: "green", reason: "Iron + B-vitamins" },
  "stevia": { name: "Stevia", flag: "green", reason: "Plant-derived sweetener" },
  "monk fruit": { name: "Monk Fruit", flag: "green", reason: "Zero-cal natural sweetener" },
  "erythritol": { name: "Erythritol", flag: "yellow", reason: "Sugar alcohol; cardio flag in 2023" },
  "xylitol": { name: "Xylitol", flag: "yellow", reason: "Sugar alcohol; toxic to dogs" },
  "sorbitol": { name: "Sorbitol", flag: "yellow", reason: "Sugar alcohol; GI distress" },
  "mannitol": { name: "Mannitol", flag: "yellow", reason: "Sugar alcohol; GI distress" },
  "sunflower oil": { name: "Sunflower Oil", flag: "yellow", reason: "Industrial processed seed oil" },
  "corn oil": { name: "Corn Oil", flag: "yellow", reason: "Omega-6 heavy; inflammatory" },
  "vegetable oil": { name: "Vegetable Oil", flag: "yellow", reason: "Unspecified seed oil blend" },
  "cottonseed oil": { name: "Cottonseed Oil", flag: "red", reason: "Pesticide-heavy crop; trans fat flag" },
  "margarine": { name: "Margarine", flag: "red", reason: "Trans fat + seed oil base" },
  "shortening": { name: "Shortening", flag: "red", reason: "Hydrogenated fat" },
  "lard": { name: "Lard", flag: "yellow", reason: "Saturated; pasture-raised better" },
  "soy protein": { name: "Soy Protein Isolate", flag: "yellow", reason: "Highly processed", allergens: ["soy"] },
  "whey": { name: "Whey", flag: "yellow", reason: "Dairy derivative", allergens: ["dairy"] },
  "casein": { name: "Casein", flag: "yellow", reason: "Dairy protein; A1 inflammation flag", allergens: ["dairy"] },
  "buttermilk": { name: "Buttermilk", flag: "yellow", reason: "Cultured dairy", allergens: ["dairy"] },
  "cream": { name: "Cream", flag: "yellow", reason: "Dairy; saturated fat", allergens: ["dairy"] },
  "butter": { name: "Butter", flag: "yellow", reason: "Grass-fed > conventional", allergens: ["dairy"] },
  "tree nuts": { name: "Tree Nuts", flag: "yellow", reason: "Common allergen", allergens: ["tree-nut"] },
  "cashews": { name: "Cashews", flag: "green", reason: "Magnesium + copper", allergens: ["tree-nut"] },
  "walnuts": { name: "Walnuts", flag: "green", reason: "Omega-3 ALA", allergens: ["tree-nut"] },
  "shellfish": { name: "Shellfish", flag: "yellow", reason: "Common allergen", allergens: ["shellfish"] },
  "fish": { name: "Fish", flag: "green", reason: "Omega-3; mercury watch", allergens: ["fish"] },
  "salmon": { name: "Salmon", flag: "green", reason: "Wild > farmed; omega-3", allergens: ["fish"] },
  "sardines": { name: "Sardines", flag: "green", reason: "Omega-3 + calcium" },
  "anchovies": { name: "Anchovies", flag: "green", reason: "Omega-3; sodium watch", allergens: ["fish"] },
  "salt": { name: "Salt", flag: "yellow", reason: "Sodium watch — <2300mg/day" },
  "sodium chloride": { name: "Salt", flag: "yellow", reason: "Sodium watch" },
  "iodized salt": { name: "Iodized Salt", flag: "yellow", reason: "Iodine source; sodium watch" },
  "himalayan salt": { name: "Himalayan Pink Salt", flag: "yellow", reason: "Trace minerals; still sodium" },
  "kosher salt": { name: "Kosher Salt", flag: "yellow", reason: "Coarser; same sodium" },
  "celery salt": { name: "Celery Salt", flag: "yellow", reason: "Natural nitrate source" },
  "vinegar": { name: "Vinegar", flag: "green", reason: "Acetic acid; blood sugar friendly" },
  "apple cider vinegar": { name: "Apple Cider Vinegar", flag: "green", reason: "Acetic acid + trace polyphenols" },
  "lemon juice": { name: "Lemon Juice", flag: "green", reason: "Vit C; pH alkalizing post-digestion" },
  "lime juice": { name: "Lime Juice", flag: "green", reason: "Vit C + electrolytes" },

  // Greens — whole foods, ferments, healing staples
  "chia seeds": { name: "Chia Seeds", flag: "green", reason: "Omega-3 ALA + fiber" },
  "flax seeds": { name: "Flax Seeds", flag: "green", reason: "Lignans + ALA" },
  "hemp seeds": { name: "Hemp Seeds", flag: "green", reason: "Complete protein + omega balance" },
  "pumpkin seeds": { name: "Pumpkin Seeds", flag: "green", reason: "Zinc + magnesium" },
  "sunflower seeds": { name: "Sunflower Seeds", flag: "green", reason: "Vit E + selenium" },
  "sesame seeds": { name: "Sesame Seeds", flag: "green", reason: "Calcium + lignans", allergens: ["sesame"] },
  "kale": { name: "Kale", flag: "green", reason: "Vit K + lutein" },
  "broccoli": { name: "Broccoli", flag: "green", reason: "Sulforaphane; cancer flag positive" },
  "brussels sprouts": { name: "Brussels Sprouts", flag: "green", reason: "Sulforaphane + fiber" },
  "cauliflower": { name: "Cauliflower", flag: "green", reason: "Low-carb veg base" },
  "cabbage": { name: "Cabbage", flag: "green", reason: "Vit C + fiber; fermented = sauerkraut" },
  "sauerkraut": { name: "Sauerkraut", flag: "green", reason: "Probiotic; gut microbiome" },
  "kimchi": { name: "Kimchi", flag: "green", reason: "Probiotic; fermented" },
  "kombucha": { name: "Kombucha", flag: "green", reason: "Fermented; check sugar grams" },
  "miso": { name: "Miso", flag: "green", reason: "Fermented soy; probiotic", allergens: ["soy"] },
  "tempeh": { name: "Tempeh", flag: "green", reason: "Fermented soy; complete protein", allergens: ["soy"] },
  "tofu": { name: "Tofu", flag: "green", reason: "Plant protein; choose organic", allergens: ["soy"] },
  "edamame": { name: "Edamame", flag: "green", reason: "Whole soybean; isoflavones", allergens: ["soy"] },
  "black beans": { name: "Black Beans", flag: "green", reason: "Anthocyanins + fiber" },
  "kidney beans": { name: "Kidney Beans", flag: "green", reason: "Iron + folate" },
  "pinto beans": { name: "Pinto Beans", flag: "green", reason: "Iron + magnesium" },
  "navy beans": { name: "Navy Beans", flag: "green", reason: "Resistant starch + folate" },
  "white beans": { name: "White Beans", flag: "green", reason: "Magnesium + iron" },
  "garbanzo beans": { name: "Garbanzo Beans", flag: "green", reason: "Same as chickpeas" },
  "split peas": { name: "Split Peas", flag: "green", reason: "Plant protein + fiber" },
  "buckwheat": { name: "Buckwheat", flag: "green", reason: "Pseudo-grain; rutin + magnesium" },
  "amaranth": { name: "Amaranth", flag: "green", reason: "Complete protein; lysine" },
  "millet": { name: "Millet", flag: "green", reason: "Gluten-free + magnesium" },
  "teff": { name: "Teff", flag: "green", reason: "Iron + calcium" },
  "barley": { name: "Barley", flag: "green", reason: "Beta-glucan", allergens: ["gluten"] },
  "rye": { name: "Rye", flag: "green", reason: "Fiber + lignans", allergens: ["gluten"] },
  "spelt": { name: "Spelt", flag: "yellow", reason: "Ancient wheat; still gluten", allergens: ["gluten"] },
  "brown rice": { name: "Brown Rice", flag: "green", reason: "Whole grain; arsenic watch" },
  "wild rice": { name: "Wild Rice", flag: "green", reason: "Higher protein than rice" },
  "steel-cut oats": { name: "Steel-Cut Oats", flag: "green", reason: "Least processed; slow release" },
  "rolled oats": { name: "Rolled Oats", flag: "green", reason: "Beta-glucan + fiber" },
  "avocado": { name: "Avocado", flag: "green", reason: "Monounsaturated + potassium" },
  "ginger": { name: "Ginger", flag: "green", reason: "Anti-inflammatory + GI support" },
  "cinnamon": { name: "Cinnamon", flag: "green", reason: "Blood sugar; choose Ceylon" },
  "cocoa": { name: "Cocoa", flag: "green", reason: "Flavanols; brain + cardio" },
  "dark chocolate": { name: "Dark Chocolate", flag: "green", reason: ">70% cacao for benefit" },
  "matcha": { name: "Matcha", flag: "green", reason: "EGCG + L-theanine" },
  "green tea": { name: "Green Tea", flag: "green", reason: "EGCG; anti-inflammatory" },
  "coffee": { name: "Coffee", flag: "yellow", reason: "Polyphenols; adrenal flag for some" },
  "cilantro": { name: "Cilantro", flag: "green", reason: "Heavy metal chelator" },
  "parsley": { name: "Parsley", flag: "green", reason: "Vit K + apigenin" },
  "basil": { name: "Basil", flag: "green", reason: "Anti-inflammatory eugenol" },
  "oregano": { name: "Oregano", flag: "green", reason: "Antimicrobial carvacrol" },
  "thyme": { name: "Thyme", flag: "green", reason: "Antimicrobial thymol" },
  "rosemary": { name: "Rosemary", flag: "green", reason: "Carnosic acid; cognition" },
  "sage": { name: "Sage", flag: "green", reason: "Anti-inflammatory" },
  "cayenne": { name: "Cayenne", flag: "green", reason: "Capsaicin; metabolic support" },
  "black pepper": { name: "Black Pepper", flag: "green", reason: "Piperine; turmeric synergy" },
  "cumin": { name: "Cumin", flag: "green", reason: "Iron + GI support" },
  "coriander": { name: "Coriander", flag: "green", reason: "Antioxidants" },
  "cardamom": { name: "Cardamom", flag: "green", reason: "GI + antimicrobial" },
  "cloves": { name: "Cloves", flag: "green", reason: "Eugenol; highest antioxidant spice" },
  "nutmeg": { name: "Nutmeg", flag: "green", reason: "Use small amounts" },
  "sweet potato": { name: "Sweet Potato", flag: "green", reason: "Beta-carotene + fiber" },
  "yam": { name: "Yam", flag: "green", reason: "Magnesium + complex carbs" },
  "carrot": { name: "Carrot", flag: "green", reason: "Beta-carotene" },
  "beet": { name: "Beet", flag: "green", reason: "Nitric oxide; blood pressure" },
  "celery": { name: "Celery", flag: "green", reason: "Apigenin + electrolytes" },
  "cucumber": { name: "Cucumber", flag: "green", reason: "Hydration + silica" },
  "tomato": { name: "Tomato", flag: "green", reason: "Lycopene" },
  "bell pepper": { name: "Bell Pepper", flag: "green", reason: "Vit C bomb" },
  "onion": { name: "Onion", flag: "green", reason: "Quercetin + prebiotic" },
  "leek": { name: "Leek", flag: "green", reason: "Prebiotic + folate" },
  "shallot": { name: "Shallot", flag: "green", reason: "Antioxidant; mild allium" },
  "asparagus": { name: "Asparagus", flag: "green", reason: "Folate + glutathione" },
  "mushroom": { name: "Mushroom", flag: "green", reason: "Vit D + beta-glucan" },
  "shiitake": { name: "Shiitake", flag: "green", reason: "Lentinan; immune support" },
  "lion's mane": { name: "Lion's Mane", flag: "green", reason: "Nerve growth factor" },
  "reishi": { name: "Reishi", flag: "green", reason: "Adaptogen; immune" },
  "chaga": { name: "Chaga", flag: "green", reason: "Antioxidant; immune" },
  "ashwagandha": { name: "Ashwagandha", flag: "green", reason: "Adaptogen; cortisol support" },
  "spirulina": { name: "Spirulina", flag: "green", reason: "Complete protein + chlorophyll" },
  "chlorella": { name: "Chlorella", flag: "green", reason: "Heavy metal chelator + B12" },
  "wheatgrass": { name: "Wheatgrass", flag: "green", reason: "Chlorophyll concentrate" },
  "moringa": { name: "Moringa", flag: "green", reason: "Plant nutrient density" },
  "bee pollen": { name: "Bee Pollen", flag: "green", reason: "Trace minerals + protein" },
  "raw cacao": { name: "Raw Cacao", flag: "green", reason: "Magnesium + flavanols" },
  "carob": { name: "Carob", flag: "green", reason: "Caffeine-free cocoa alternative" },
  "coconut oil": { name: "Coconut Oil", flag: "yellow", reason: "Saturated but MCTs" },
  "mct oil": { name: "MCT Oil", flag: "green", reason: "Direct ketone fuel" },
  "ghee": { name: "Ghee", flag: "green", reason: "Clarified butter; lactose-free", allergens: ["dairy"] },
  "almond butter": { name: "Almond Butter", flag: "green", reason: "Magnesium + healthy fat", allergens: ["tree-nut"] },
  "peanut butter": { name: "Peanut Butter", flag: "yellow", reason: "Protein; aflatoxin watch", allergens: ["peanut"] },
  "sea salt flakes": { name: "Sea Salt Flakes", flag: "yellow", reason: "Sodium watch" },
  "pink salt": { name: "Pink Salt", flag: "yellow", reason: "Trace minerals; still sodium" },
};

function analyzeIngredients(text) {
  const lower = (text || "").toLowerCase();
  const flags = [];
  const allergens = new Set();
  let red = 0, yellow = 0, green = 0;
  for (const key of Object.keys(INGREDIENT_DB)) {
    if (lower.includes(key)) {
      const ing = INGREDIENT_DB[key];
      flags.push({ key, ingredient: ing });
      if (ing.flag === "red") red++;
      else if (ing.flag === "yellow") yellow++;
      else green++;
      (ing.allergens || []).forEach((a) => allergens.add(a));
    }
  }
  let score = 80 + green * 6 - red * 14 - yellow * 5;
  if (flags.length === 0) score = 60;
  return { score: Math.max(0, Math.min(100, score)), red, yellow, green, flags, allergens: [...allergens] };
}

const SAMPLE_LABEL = `Enriched wheat flour, soybean oil, palm oil, cane sugar, cheese seasoning (whey, salt, monosodium glutamate, natural flavors, yellow 5, yellow 6), TBHQ for freshness, soy lecithin.`;

const CATEGORIES = ["Snacks", "Cereals", "Dairy", "Beverages", "Frozen", "Sauces"];

const SWAP_DB = [
  { category: "Snacks", fromName: "Cheesy Crackers", fromBrand: "Cheez-It", fromScore: 38, fromIssues: ["TBHQ", "Soybean Oil", "Yellow 6"], toName: "Sprouted Seed Crackers", toBrand: "Mary's Gone", toScore: 86, reasons: ["No artificial preservatives", "Sprouted whole grains", "Lower sodium"], nutrition: { sodium: [230, 80], sugar: [0, 0], fiber: [1, 3] }, carries: ["sevananda", "wholefoods", "tj"] },
  { category: "Snacks", fromName: "Original Chips", fromBrand: "Lay's", fromScore: 42, fromIssues: ["Seed Oil", "Sodium"], toName: "Avocado Oil Chips", toBrand: "Siete", toScore: 78, reasons: ["Cooked in avocado oil", "Grain-free", "No seed oils"], nutrition: { sodium: [170, 90], sugar: [0, 0], fiber: [1, 2] }, carries: ["wholefoods", "tj", "sprouts"] },
  { category: "Cereals", fromName: "Frosted Flakes", fromBrand: "Kellogg's", fromScore: 32, fromIssues: ["BHT", "Cane Sugar", "Yellow 5"], toName: "Sprouted Power Flakes", toBrand: "Ezekiel 4:9", toScore: 88, reasons: ["Sprouted grains", "No added sugar", "Higher protein"], nutrition: { sodium: [190, 75], sugar: [12, 0], fiber: [1, 6] }, carries: ["sevananda", "wholefoods", "kroger"] },
  { category: "Cereals", fromName: "Honey Nut Os", fromBrand: "Cheerios", fromScore: 48, fromIssues: ["Cane Sugar", "Natural Flavors"], toName: "Steel-Cut Oats", toBrand: "Bob's Red Mill", toScore: 92, reasons: ["Single ingredient", "Beta-glucan fiber", "Slow-release energy"], nutrition: { sodium: [190, 0], sugar: [9, 1], fiber: [3, 4] }, carries: ["sevananda", "wholefoods", "kroger", "tj"] },
  { category: "Dairy", fromName: "Strawberry Yogurt", fromBrand: "Yoplait", fromScore: 36, fromIssues: ["HFCS", "Red 40"], toName: "Plain Greek + Berries", toBrand: "Stonyfield", toScore: 82, reasons: ["No artificial color", "2x protein", "Live probiotics"], nutrition: { sodium: [105, 65], sugar: [18, 4], fiber: [0, 2] }, carries: ["wholefoods", "kroger", "tj"] },
  { category: "Beverages", fromName: "Citrus Soda", fromBrand: "Mountain Dew", fromScore: 18, fromIssues: ["HFCS", "Yellow 5"], toName: "Sparkling Water + Lime", toBrand: "Spindrift", toScore: 94, reasons: ["No added sugar", "Real fruit juice", "Zero artificial color"], nutrition: { sodium: [60, 0], sugar: [46, 1], fiber: [0, 0] }, carries: ["wholefoods", "tj", "kroger", "sprouts"] },
  { category: "Frozen", fromName: "Pepperoni Pizza", fromBrand: "DiGiorno", fromScore: 28, fromIssues: ["Sodium Nitrite", "Soybean Oil"], toName: "Cauliflower Crust Veggie", toBrand: "Caulipower", toScore: 74, reasons: ["No nitrites", "Cauliflower base", "Fewer additives"], nutrition: { sodium: [780, 380], sugar: [6, 3], fiber: [2, 4] }, carries: ["wholefoods", "kroger", "sprouts"] },
  { category: "Sauces", fromName: "Tomato Ketchup", fromBrand: "Heinz", fromScore: 44, fromIssues: ["HFCS", "Natural Flavors"], toName: "Organic Ketchup, No Sugar", toBrand: "Primal Kitchen", toScore: 84, reasons: ["No HFCS", "No added sugar", "Organic tomatoes"], nutrition: { sodium: [160, 110], sugar: [4, 0], fiber: [0, 0] }, carries: ["wholefoods", "sprouts", "tj"] },
];

const SOURCES = [
  { id: "sevananda", name: "Sevananda Natural Foods", short: "Sevananda", type: "Co-op", distance: 1.2, transparency: 96, price: 2, carries: ["sea moss", "tahini", "sprouted grain", "lentils", "quinoa"], x: 22, y: 38 },
  { id: "freedom-fm", name: "Freedom Farmers Market", short: "Freedom FM", type: "Farmer's Market", distance: 0.8, transparency: 92, price: 2, carries: ["spinach", "blueberries", "garlic", "turmeric"], x: 36, y: 22 },
  { id: "wholefoods", name: "Whole Foods Ponce", short: "Whole Foods", type: "Grocery", distance: 2.1, transparency: 78, price: 3, carries: ["sea moss", "tahini", "olive oil", "almonds", "sprouted grain", "quinoa"], x: 50, y: 30 },
  { id: "tj", name: "Trader Joe's Midtown", short: "Trader Joe's", type: "Grocery", distance: 1.6, transparency: 70, price: 1, carries: ["olive oil", "almonds", "blueberries", "oats", "quinoa"], x: 64, y: 44 },
  { id: "kroger", name: "Kroger Edgewood", short: "Kroger", type: "Grocery", distance: 1.1, transparency: 58, price: 1, carries: ["oats", "lentils", "olive oil"], x: 45, y: 60 },
  { id: "sprouts", name: "Sprouts Farmers Market", short: "Sprouts", type: "Grocery", distance: 3.4, transparency: 74, price: 2, carries: ["sea moss", "tahini", "almonds", "turmeric", "quinoa"], x: 78, y: 56 },
  { id: "rainbow", name: "Rainbow Grocery", short: "Rainbow", type: "Specialty", distance: 2.7, transparency: 90, price: 2, carries: ["sea moss", "tahini", "sprouted grain", "turmeric"], x: 18, y: 70 },
  { id: "atl-farm", name: "ATL Urban Farm Stand", short: "ATL Urban", type: "Farmer's Market", distance: 1.9, transparency: 94, price: 2, carries: ["spinach", "blueberries", "garlic", "almonds"], x: 60, y: 80 },
];

const NUTRIENTS = [
  { name: "Iron", value: "9.2 mg", target: "12.0 mg", status: "low" },
  { name: "Vitamin D", value: "28 ng/mL", target: "40 ng/mL", status: "low" },
  { name: "Magnesium", value: "420 mg", target: "320 mg", status: "high" },
  { name: "Hydration", value: "92%", target: "85%", status: "good" },
  { name: "Fiber", value: "31 g", target: "25 g", status: "good" },
  { name: "Potassium", value: "4.1 g", target: "3.5 g", status: "good" },
];

const MEAL_PLANS = [
  { slot: "Breakfast", name: "Steel-Cut Oats + Blueberries + Almonds", cost: 2.40, ingredients: ["steel-cut oats", "blueberries", "almonds", "cinnamon"], nutrients: ["Iron", "Magnesium", "Fiber"], time: "12 min" },
  { slot: "Lunch", name: "Lentil + Spinach Power Bowl", cost: 4.10, ingredients: ["lentils", "spinach", "quinoa", "olive oil", "garlic", "tahini"], nutrients: ["Iron", "Folate", "Protein"], time: "22 min" },
  { slot: "Dinner", name: "Sea Moss Smoothie + Sprouted Toast", cost: 5.30, ingredients: ["sea moss gel", "blueberries", "almond milk", "sprouted grain bread", "tahini"], nutrients: ["Vitamin D", "Calcium", "Iodine"], time: "8 min" },
];

// Synthetic 14-day score history (with mild noise) — represents user's last 2 weeks of decoded scans.
const SCORE_HISTORY = (() => {
  const arr = [];
  for (let i = 13; i >= 0; i--) {
    const base = 54 + Math.round(Math.sin(i * 0.7) * 10) + (i < 4 ? 12 : 0);
    arr.push(Math.max(20, Math.min(96, base)));
  }
  return arr;
})();

const RECENT_SCANS = [
  { name: "Sprouted Power Flakes", brand: "Ezekiel 4:9", score: 88, when: "Today · 8:02 AM", flag: "green" },
  { name: "Plain Greek + Berries", brand: "Stonyfield", score: 82, when: "Yesterday · 7:30 PM", flag: "green" },
  { name: "Cheesy Crackers", brand: "Cheez-It", score: 38, when: "Yesterday · 3:11 PM", flag: "red" },
  { name: "Sparkling Water + Lime", brand: "Spindrift", score: 94, when: "Sun · 1:24 PM", flag: "green" },
  { name: "Tomato Ketchup", brand: "Heinz", score: 44, when: "Sat · 6:48 PM", flag: "red" },
];

Object.assign(window, {
  INGREDIENT_DB, analyzeIngredients, SAMPLE_LABEL, CATEGORIES, SWAP_DB,
  SOURCES, NUTRIENTS, MEAL_PLANS, SCORE_HISTORY, RECENT_SCANS,
});
