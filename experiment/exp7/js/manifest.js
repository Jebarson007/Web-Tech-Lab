// 2025 season calendar. Folder names match the TracingInsights-Archive/2025 repo exactly.
const STD = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"];
const SPRINT = ["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"];

const EVENTS = [
  { round: 1,  name: "Australian Grand Prix",     country: "Australia",     flag: "🇦🇺", circuit: "Albert Park",           date: "2025-03-16", sessions: STD },
  { round: 2,  name: "Chinese Grand Prix",        country: "China",         flag: "🇨🇳", circuit: "Shanghai",              date: "2025-03-23", sessions: SPRINT },
  { round: 3,  name: "Japanese Grand Prix",       country: "Japan",         flag: "🇯🇵", circuit: "Suzuka",                date: "2025-04-06", sessions: STD },
  { round: 4,  name: "Bahrain Grand Prix",        country: "Bahrain",       flag: "🇧🇭", circuit: "Sakhir",                date: "2025-04-13", sessions: STD },
  { round: 5,  name: "Saudi Arabian Grand Prix",  country: "Saudi Arabia",  flag: "🇸🇦", circuit: "Jeddah Corniche",       date: "2025-04-20", sessions: STD },
  { round: 6,  name: "Miami Grand Prix",          country: "USA",           flag: "🇺🇸", circuit: "Miami International",   date: "2025-05-04", sessions: SPRINT },
  { round: 7,  name: "Emilia Romagna Grand Prix", country: "Italy",         flag: "🇮🇹", circuit: "Imola",                 date: "2025-05-18", sessions: STD },
  { round: 8,  name: "Monaco Grand Prix",         country: "Monaco",        flag: "🇲🇨", circuit: "Monte Carlo",           date: "2025-05-25", sessions: STD },
  { round: 9,  name: "Spanish Grand Prix",        country: "Spain",         flag: "🇪🇸", circuit: "Barcelona-Catalunya",   date: "2025-06-01", sessions: STD },
  { round: 10, name: "Canadian Grand Prix",       country: "Canada",        flag: "🇨🇦", circuit: "Gilles Villeneuve",     date: "2025-06-15", sessions: STD },
  { round: 11, name: "Austrian Grand Prix",       country: "Austria",       flag: "🇦🇹", circuit: "Red Bull Ring",         date: "2025-06-29", sessions: STD },
  { round: 12, name: "British Grand Prix",        country: "Great Britain", flag: "🇬🇧", circuit: "Silverstone",           date: "2025-07-06", sessions: STD },
  { round: 13, name: "Belgian Grand Prix",        country: "Belgium",       flag: "🇧🇪", circuit: "Spa-Francorchamps",     date: "2025-07-27", sessions: SPRINT },
  { round: 14, name: "Hungarian Grand Prix",      country: "Hungary",       flag: "🇭🇺", circuit: "Hungaroring",           date: "2025-08-03", sessions: STD },
  { round: 15, name: "Dutch Grand Prix",          country: "Netherlands",   flag: "🇳🇱", circuit: "Zandvoort",             date: "2025-08-31", sessions: STD },
  { round: 16, name: "Italian Grand Prix",        country: "Italy",         flag: "🇮🇹", circuit: "Monza",                 date: "2025-09-07", sessions: STD },
  { round: 17, name: "Azerbaijan Grand Prix",     country: "Azerbaijan",    flag: "🇦🇿", circuit: "Baku City",             date: "2025-09-21", sessions: STD },
  { round: 18, name: "Singapore Grand Prix",      country: "Singapore",     flag: "🇸🇬", circuit: "Marina Bay",            date: "2025-10-05", sessions: STD },
  { round: 19, name: "United States Grand Prix",  country: "USA",           flag: "🇺🇸", circuit: "Circuit of the Americas", date: "2025-10-19", sessions: SPRINT },
  { round: 20, name: "Mexico City Grand Prix",    country: "Mexico",        flag: "🇲🇽", circuit: "Hermanos Rodríguez",    date: "2025-10-26", sessions: STD },
  { round: 21, name: "São Paulo Grand Prix",      country: "Brazil",        flag: "🇧🇷", circuit: "Interlagos",            date: "2025-11-09", sessions: SPRINT },
  { round: 22, name: "Las Vegas Grand Prix",      country: "USA",           flag: "🇺🇸", circuit: "Las Vegas Strip",       date: "2025-11-22", sessions: STD },
  { round: 23, name: "Qatar Grand Prix",          country: "Qatar",         flag: "🇶🇦", circuit: "Lusail",                date: "2025-11-30", sessions: SPRINT },
  { round: 24, name: "Abu Dhabi Grand Prix",      country: "UAE",           flag: "🇦🇪", circuit: "Yas Marina",            date: "2025-12-07", sessions: STD },
];

const SESSION_SHORT = {
  "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3",
  "Sprint Qualifying": "SQ", "Sprint": "Sprint", "Qualifying": "Quali", "Race": "Race",
};

// ISO codes for flag images (Windows doesn't render flag emoji).
const COUNTRY_ISO = {
  "Australia": "au", "China": "cn", "Japan": "jp", "Bahrain": "bh", "Saudi Arabia": "sa", "USA": "us",
  "Italy": "it", "Monaco": "mc", "Spain": "es", "Canada": "ca", "Austria": "at", "Great Britain": "gb",
  "Belgium": "be", "Hungary": "hu", "Netherlands": "nl", "Azerbaijan": "az", "Singapore": "sg",
  "Mexico": "mx", "Brazil": "br", "Qatar": "qa", "UAE": "ae",
};
const flagImg = (e, h = 22) =>
  `<img class="flag-img" src="https://flagcdn.com/h40/${COUNTRY_ISO[e.country]}.png" alt="${e.country}" height="${h}" loading="lazy">`;
