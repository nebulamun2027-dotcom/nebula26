/* ==========================================================================
   NEBULA MUN 2026 — central committee & portfolio data
   Single source of truth for committee names, types, fees, agendas
   and complete portfolio matrices. Phase 3 (database, payment-proof,
   admin dashboard) can read this same file without touching the UI.
   ========================================================================== */

/* Fee policy: the organiser's final payable-amount rule is not configured
   yet. Do NOT sum the three preference fees. To change this later, set
   PAYABLE_FEE to "sum", "max", or a fixed number (e.g. 1800). */
const PAYABLE_FEE = "TBD";

const CURRENCY = "₹";

/* ---------- venue (The Venue section) ----------
   "MSM, Meerut" and the full address below were confirmed by the organiser
   (no coordinates or building pin beyond this address are claimed — the
   embed/directions URLs are address-based, exactly as supplied):

   - address:         organiser-confirmed full address of MSM, Meerut
   - mapsEmbed:       address-based Google Maps embed (interactive map with
                      standard zoom + navigation controls)
   - mapsDirections:  Google Maps directions URL opening the same address
   js/venue.js reads these and switches the section from the pending panel
   to the interactive map state automatically. */
const VENUE = {
  name: "MSM",
  shortName: "MSM",
  fullTitle: "MSM, Meerut",
  city: "Meerut, India",
  dates: "26 – 27 December 2026",
  /* Short professional description shown in the venue information panel. */
  description:
    "Delegates gather here for two days of diplomacy, debate and negotiation — where the position paper lands, the amendment holds and the resolution carries the floor.",
  /* Pending note shown until the exact address is verified. */
  addressNote: "Full venue address will be announced by the organising team.",
  address: "WPPJ+J5F, DS - 1, B Block, Pocket - D, Lohia Nagar, Meerut, Uttar Pradesh 250002",
  mapsEmbed:
    "https://www.google.com/maps?q=WPPJ%2BJ5F%2C%20DS-1%2C%20B%20Block%2C%20Pocket-D%2C%20Lohia%20Nagar%2C%20Meerut%2C%20Uttar%20Pradesh%20250002&output=embed",
  mapsDirections:
    "https://www.google.com/maps/dir/?api=1&destination=WPPJ%2BJ5F%2C%20DS-1%2C%20B%20Block%2C%20Pocket-D%2C%20Lohia%20Nagar%2C%20Meerut%2C%20Uttar%20Pradesh%20250002"
};

const COMMITTEES = [
  {
    id: "unhrc",
    num: "01",
    short: "UNHRC",
    name: "United Nations Human Rights Council",
    type: "Conventional Committee",
    tier: 1,
    fee: 1800,
    track: "General Assembly",
    blurb: "Human rights, accountability and the language that forces a state to answer for what it has done.",
    description:
      "Promotes and protects human rights globally. Delegates address humanitarian crises, systemic rights violations, international compliance, diplomatic negotiations, resolution drafting, and consensus building.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "35 national portfolios",
    portfolios: [
      "United States of America", "United Kingdom", "France", "Russian Federation",
      "People's Republic of China", "Germany", "Canada", "Australia", "Italy",
      "Spain", "Netherlands", "Sweden", "Switzerland", "India", "Japan",
      "Islamic Republic of Iran", "Republic of Korea", "Saudi Arabia",
      "United Arab Emirates", "Pakistan", "Indonesia", "South Africa", "Nigeria",
      "Egypt", "Kenya", "Ethiopia", "Rwanda", "Algeria", "Brazil", "Argentina",
      "Mexico", "Colombia", "Chile", "Cuba", "Ukraine"
    ]
  },
  {
    id: "uncsw",
    num: "02",
    short: "UNCSW",
    name: "United Nations Commission on the Status of Women",
    type: "Functional Commission / Specialized Committee",
    tier: 1,
    fee: 1800,
    track: "General Assembly",
    blurb: "Gender equality as policy, not a platitude. Drafts measured against the rights they are meant to protect.",
    description:
      "Focuses on gender equality and women's empowerment, including structural inequality, social protection, political participation, and economic inclusion.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "35 national portfolios",
    portfolios: [
      "United States of America", "Canada", "United Kingdom", "France", "Germany",
      "Sweden", "Norway", "Denmark", "Iceland", "Switzerland",
      "Italy", "Spain", "Netherlands", "Finland", "India",
      "Japan", "People's Republic of China", "Republic of Korea", "Philippines",
      "Indonesia", "Bangladesh", "Vietnam", "Saudi Arabia", "South Africa",
      "Nigeria", "Kenya", "Egypt", "Ghana", "Morocco", "Rwanda",
      "Brazil", "Argentina", "Mexico", "Chile", "Colombia"
    ]
  },
  {
    id: "lok-sabha",
    num: "03",
    short: "Lok Sabha",
    name: "Parliament of India (Lok Sabha)",
    type: "Indian Parliamentary Committee",
    tier: 1,
    fee: 1800,
    track: "National",
    blurb: "The nation's floor. Debate moves fast, caucuses move faster, and every vote counts twice.",
    description:
      "Simulates the lower house of India's Parliament. Delegates debate national issues, challenge government policy, develop legislation, use parliamentary procedure, and negotiate political outcomes.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "35 political portfolios",
    portfolios: [
      "Narendra Modi", "Amit Shah", "Nirmala Sitharaman", "S. Jaishankar",
      "Rajnath Singh", "Nitin Gadkari", "Ashwini Vaishnaw", "Om Birla",
      "Rahul Gandhi", "Akhilesh Yadav", "Mahua Moitra", "Shashi Tharoor",
      "Asaduddin Owaisi", "Kangana Ranaut", "Arun Govil", "Chirag Paswan",
      "Supriya Sule", "Kanimozhi Karunanidhi", "Amritpal Singh", "Engineer Rashid",
      "Yogi Adityanath", "Dimple Yadav", "Ravindra Waikar", "Sambit Patra",
      "Gourav Vallabh", "Pawan Khera", "Sanjay Singh", "K. Annamalai",
      "Tejasvi Surya", "Deepender Singh Hooda", "Pappu Yadav", "Bansuri Swaraj",
      "Manish Tewari", "Chandrashekhar Azad “Ravan”", "Raghav Chadha"
    ]
  },
  {
    id: "influencer",
    num: "04",
    short: "Influencer Summit",
    name: "Influencer Summit",
    type: "Modern Committee / Special Cabinet",
    tier: 2,
    fee: 1650,
    track: "Special",
    blurb: "The loudest platform in the room. Influence without a code of conduct is just noise with reach.",
    description:
      "Digital creators, media strategists, and internet personalities confront questions of digital ethics, monetisation, platform regulation, viral crises, public relations, and social influence.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "35 creator portfolios",
    portfolios: [
      "Dolly Chaiwala", "Rebel Kid", "Vir Das", "Dhruv Rathee", "Samay Raina",
      "CarryMinati", "Ranveer Allahbadia", "Elvish Yadav", "Abhishek Malhan",
      "MrBeast", "Speed", "Orry", "Uorfi Javed", "Prajakta Koli",
      "Bhuvan Bam", "Ashish Chanchlani", "Kusha Kapila", "Dolly Singh",
      "Sharan Hegde", "Akshat Shrivastava", "Technical Guruji", "Marques Brownlee",
      "Gaurav Taneja", "MortaL", "Scout", "Niharika NM", "Tanmay Bhat",
      "Thara Bhai Joginder", "Rajat Dalal", "Abhi and Niyu", "Archana Gautam",
      "Logan Paul", "KSI", "ASCI Representative", "Global PR Director"
    ]
  },
  {
    id: "mythology",
    num: "05",
    short: "Mythology Crisis",
    name: "Indian Mythology Crisis Committee",
    type: "Historical / Epic Crisis Committee",
    tier: 2,
    fee: 1650,
    track: "Crisis",
    blurb: "A crisis straight out of the epics: gods and dynasties at war, and only the floor stands between them.",
    description:
      "A dynamic simulation inspired by the Mahabharata universe. Delegates navigate alliances, royal politics, military strategy, moral dilemmas, and evolving crisis situations.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "35 faction roles",
    factions: [
      {
        label: "Faction A — Pandava Alignment & Royal Court",
        roles: [
          { name: "Yudhishthira", desc: "King of Righteousness & Eldest Pandava" },
          { name: "Arjuna", desc: "Master Archer & Pandava Military Commander" },
          { name: "Bhima", desc: "Frontline Warrior & Master of Heavy Weapons" },
          { name: "Nakula", desc: "Master of Cavalry Strategy & Swordsmanship" },
          { name: "Sahadeva", desc: "Master of Astrological Foresight & Statecraft" },
          { name: "Draupadi", desc: "Empress of Indraprastha & Political Strategist" },
          { name: "Abhimanyu", desc: "Young Vanguard & Master of Complex Formations" },
          { name: "Ghatotkacha", desc: "Chief of the Rakshasa Clan & Night Warfare Titan" },
          { name: "King Drupada", desc: "Sovereign of Panchala" },
          { name: "King Virata", desc: "Ruler of the Matsya Kingdom" }
        ]
      },
      {
        label: "Faction B — Kaurava High Command & Allies",
        roles: [
          { name: "Duryodhana", desc: "Crown Prince of Hastinapur" },
          { name: "Karna", desc: "King of Anga & Master Archer" },
          { name: "Bhishma", desc: "Grand Sire & Supreme Commander of Hastinapur" },
          { name: "Dronacharya", desc: "Royal Guru & Grand Strategist" },
          { name: "Shakuni", desc: "King of Gandhara & Master Strategist" },
          { name: "Dushasana", desc: "Senior Prince of Hastinapur" },
          { name: "Ashwatthama", desc: "Immortal Warrior & Son of Drona" },
          { name: "Kritavarma", desc: "Commander of the Narayani Sena" },
          { name: "Kripacharya", desc: "Royal High Council Elder & Guru" },
          { name: "King Shalya", desc: "Sovereign of Madra Kingdom" }
        ]
      },
      {
        label: "Faction C — Regional Monarchs & Independent Rulers",
        roles: [
          { name: "King Bhagadatta", desc: "Ruler of Pragjyotisha & Master of War Elephants" },
          { name: "King Jayadratha", desc: "Ruler of Sindhu Kingdom" },
          { name: "King Jarasandha (Historical/Crisis Faction)", desc: "Sovereign of Magadha" },
          { name: "King Rukmi", desc: "Prince of Vidarbha" },
          { name: "King Nila", desc: "Monarch of Avanti" },
          { name: "King Vinda", desc: "Co-ruler of Avanti" },
          { name: "King Barbarika", desc: "Warrior of Unmatched Mystic Weapons" },
          { name: "King Susharma", desc: "Ruler of Trigarta & Leader of the Samsaptakas" }
        ]
      },
      {
        label: "Faction D — Divine Envoys, Neutral Elders & Sages",
        roles: [
          { name: "Lord Krishna", desc: "Prime Diplomat & Supreme Strategist (Non-combat Envoy)" },
          { name: "Balarama", desc: "Sovereign of Dwarka & Neutral Elder" },
          { name: "Vidura", desc: "Chief Prime Minister of Hastinapur" },
          { name: "Maharishi Narada", desc: "Celestial Envoy & Information Broker" },
          { name: "Lord Parashurama", desc: "Immortal Master of Arms & Neutral Sage" },
          { name: "Rishi Durvasa", desc: "High Mystic & Neutral Authority" },
          { name: "Sanjava", desc: "Royal Advisor & Telepathic Chronicler of Hastinapur" }
        ]
      }
    ]
  },
  {
    id: "harry-potter",
    num: "06",
    short: "Wizarding Crisis",
    name: "Harry Potter Crisis Committee",
    type: "Fictional / Fantasy Crisis Committee",
    tier: 3,
    fee: 1500,
    track: "Crisis",
    blurb: "Ministry, magic and an unfolding crisis. The hardest spell here is consensus.",
    description:
      "A magical-world crisis simulation featuring political intrigue, secret directives, wartime strategy, alliances, and interventions that shape the wizarding world.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "35 faction roles",
    factions: [
      {
        label: "Faction A — Order of the Phoenix & Hogwarts Resistance",
        roles: [
          { name: "Albus Dumbledore", desc: "Headmaster of Hogwarts & Chief Wizard" },
          { name: "Minerva McGonagall", desc: "Deputy Headmistress & Transfiguration Master" },
          { name: "Alastor “Mad-Eye” Moody", desc: "Veteran Auror & Crisis Tactician" },
          { name: "Kingsley Shacklebolt", desc: "Senior Auror & Order Vanguard" },
          { name: "Remus Lupin", desc: "Defense Master & Underground Envoy" },
          { name: "Sirius Black", desc: "Order Operative & Recon Specialist" },
          { name: "Severus Snape", desc: "Potions Master & Double-Agent" },
          { name: "Nymphadora Tonks", desc: "Covert Auror Operations" },
          { name: "Arthur Weasley", desc: "Ministry Insider & Muggle Artifact Specialist" },
          { name: "Harry Potter", desc: "Leader of Dumbledore’s Army" }
        ]
      },
      {
        label: "Faction B — Ministry of Magic & Bureaucracy",
        roles: [
          { name: "Cornelius Fudge", desc: "Minister for Magic" },
          { name: "Rufus Scrimgeour", desc: "Head of the Auror Office" },
          { name: "Amelia Bones", desc: "Head of Magical Law Enforcement" },
          { name: "Dolores Umbridge", desc: "Senior Undersecretary to the Minister" },
          { name: "Bartemius Crouch Sr.", desc: "Head of International Magical Cooperation" },
          { name: "Percy Weasley", desc: "Junior Assistant to the Minister" },
          { name: "Ludo Bagman", desc: "Head of Magical Games and Sports" },
          { name: "Gawain Robards", desc: "Senior Auror Commander" },
          { name: "Pius Thicknesse", desc: "Senior Ministry Official / Head of Department" }
        ]
      },
      {
        label: "Faction C — Death Eaters & Dark High Council",
        roles: [
          { name: "Lord Voldemort / Dark Lord Representative", desc: "High Commander (assign to top delegate/EB)" },
          { name: "Lucius Malfoy", desc: "Financial Benefactor & Political Infiltrator" },
          { name: "Bellatrix Lestrange", desc: "Chief Dark Vanguard" },
          { name: "Corban Yaxley", desc: "Dark Infiltrator in Law Enforcement" },
          { name: "Antonin Dolohov", desc: "Master Duelist & Combat Strategist" },
          { name: "Fenrir Greyback", desc: "Leader of the Werewolf Pack Alignment" },
          { name: "Narcissa Malfoy", desc: "Pureblood Socialite & High Society Broker" },
          { name: "Augustus Rookwood", desc: "Department of Mysteries Infiltrator" },
          { name: "Thorfinn Rowle", desc: "Dark Combat Specialist" }
        ]
      },
      {
        label: "Faction D — Neutral Powers, International Envoys & Independent Factions",
        roles: [
          { name: "Igor Karkaroff", desc: "Headmaster of Durmstrang Institute" },
          { name: "Olympe Maxime", desc: "Headmistress of Beauxbatons Academy" },
          { name: "Xenophilius Lovegood", desc: "Editor of The Quibbler & Media Voice" },
          { name: "Aberforth Dumbledore", desc: "Hogsmeade Underground Contact" },
          { name: "Griphook", desc: "Gringotts Goblin Bank Representative" },
          { name: "Bogrod", desc: "Senior Gringotts Financial Governor" },
          { name: "Kreach/Dobby Alignment Representative", desc: "House-Elf Rights & Underground Intelligence Representative" }
        ]
      }
    ]
  },
  {
    id: "ipl",
    num: "07",
    short: "IPL Auction",
    name: "IPL Auction / Crisis Committee",
    type: "Sports Management / Strategic Auction",
    tier: 3,
    fee: 1500,
    track: "Crisis",
    blurb: "The auction floor meets the crisis desk. Every rupee is a statement, every pick a strategy.",
    description:
      "Delegates represent IPL franchises, manage auction strategy and budgets, bid for players, handle regulatory challenges, and navigate sports public-relations crises.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "10 IPL franchises",
    portfolios: [
      "Chennai Super Kings", "Delhi Capitals", "Gujarat Titans",
      "Kolkata Knight Riders", "Lucknow Super Giants", "Mumbai Indians",
      "Punjab Kings", "Rajasthan Royals", "Royal Challengers Bengaluru",
      "Sunrisers Hyderabad"
    ]
  },
  {
    id: "international-press",
    num: "08",
    short: "International Press",
    name: "International Press (IP)",
    type: "Journalism & Media Corps",
    tier: 3,
    fee: 1500,
    track: "Media",
    blurb: "The floor's memory. Write the headlines others will read long after the gavel falls.",
    description:
      "The eyes and ears of NEBULA MUN. Members cover committee proceedings, question delegates, report on press conferences, publish newsletters, and produce photojournalism and caricatures.",
    agenda: "To Be Announced Shortly",
    portfolioNote: "3 press roles",
    portfolios: [
      "Journalists / Reporters", "Photojournalists", "Caricaturists / Illustrators"
    ]
  }
];

/* ---------- helpers ---------- */

/* Flat list of every selectable portfolio name for a committee. */
function getPortfolioNames(committee) {
  if (committee.portfolios) return committee.portfolios.slice();
  if (committee.factions) {
    const names = [];
    for (const f of committee.factions) {
      for (const role of f.roles) names.push(role.name);
    }
    return names;
  }
  return [];
}

/* Flat list of every portfolio with its faction group, for grouped selectors. */
function getPortfolioGroups(committee) {
  const groups = [];
  if (committee.factions) {
    for (const f of committee.factions) {
      groups.push({
        label: f.label,
        items: f.roles.map((r) => r.name)
      });
    }
  } else if (committee.portfolios) {
    groups.push({ label: committee.portfolioNote || "Portfolios", items: committee.portfolios });
  }
  return groups;
}

/* Format a fee with the currency symbol. */
function formatFee(fee) {
  return CURRENCY + "" + fee.toLocaleString("en-IN");
}
