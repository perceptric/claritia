// States, provinces and regions for the 20 countries forms ask about most (docs/forms-plan.md 2.2), by ISO 3166-1
// code. A dropdown set to follow a country field shows the list for the country picked. They never ship in the form
// script: a form that uses them gets them with the form itself (src/app/api/forms/[id]/route.ts), so what the visitor
// sees and what the server checks always come from the same lists. English names, as a CRM's state field takes them.

const LISTS: Record<string, string> = {
  US: "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming",
  CA: "Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Northwest Territories|Nova Scotia|Nunavut|Ontario|Prince Edward Island|Quebec|Saskatchewan|Yukon",
  MX: "Aguascalientes|Baja California|Baja California Sur|Campeche|Chiapas|Chihuahua|Coahuila|Colima|Durango|Guanajuato|Guerrero|Hidalgo|Jalisco|Mexico City|México|Michoacán|Morelos|Nayarit|Nuevo León|Oaxaca|Puebla|Querétaro|Quintana Roo|San Luis Potosí|Sinaloa|Sonora|Tabasco|Tamaulipas|Tlaxcala|Veracruz|Yucatán|Zacatecas",
  BR: "Acre|Alagoas|Amapá|Amazonas|Bahia|Ceará|Distrito Federal|Espírito Santo|Goiás|Maranhão|Mato Grosso|Mato Grosso do Sul|Minas Gerais|Pará|Paraíba|Paraná|Pernambuco|Piauí|Rio de Janeiro|Rio Grande do Norte|Rio Grande do Sul|Rondônia|Roraima|Santa Catarina|São Paulo|Sergipe|Tocantins",
  AR: "Buenos Aires|Buenos Aires City|Catamarca|Chaco|Chubut|Córdoba|Corrientes|Entre Ríos|Formosa|Jujuy|La Pampa|La Rioja|Mendoza|Misiones|Neuquén|Río Negro|Salta|San Juan|San Luis|Santa Cruz|Santa Fe|Santiago del Estero|Tierra del Fuego|Tucumán",
  GB: "England|Northern Ireland|Scotland|Wales",
  IE: "Carlow|Cavan|Clare|Cork|Donegal|Dublin|Galway|Kerry|Kildare|Kilkenny|Laois|Leitrim|Limerick|Longford|Louth|Mayo|Meath|Monaghan|Offaly|Roscommon|Sligo|Tipperary|Waterford|Westmeath|Wexford|Wicklow",
  FR: "Auvergne-Rhône-Alpes|Brittany|Burgundy-Franche-Comté|Centre-Val de Loire|Corsica|French Guiana|Grand Est|Guadeloupe|Hauts-de-France|Île-de-France|Martinique|Mayotte|Normandy|Nouvelle-Aquitaine|Occitania|Pays de la Loire|Provence-Alpes-Côte d'Azur|Réunion",
  DE: "Baden-Württemberg|Bavaria|Berlin|Brandenburg|Bremen|Hamburg|Hesse|Lower Saxony|Mecklenburg-Western Pomerania|North Rhine-Westphalia|Rhineland-Palatinate|Saarland|Saxony|Saxony-Anhalt|Schleswig-Holstein|Thuringia",
  ES: "Andalusia|Aragon|Asturias|Balearic Islands|Basque Country|Canary Islands|Cantabria|Castile and León|Castilla-La Mancha|Catalonia|Ceuta|Extremadura|Galicia|La Rioja|Madrid|Melilla|Murcia|Navarre|Valencia",
  IT: "Abruzzo|Aosta Valley|Apulia|Basilicata|Calabria|Campania|Emilia-Romagna|Friuli-Venezia Giulia|Lazio|Liguria|Lombardy|Marche|Molise|Piedmont|Sardinia|Sicily|Trentino-South Tyrol|Tuscany|Umbria|Veneto",
  NL: "Drenthe|Flevoland|Friesland|Gelderland|Groningen|Limburg|North Brabant|North Holland|Overijssel|South Holland|Utrecht|Zeeland",
  CH: "Aargau|Appenzell Ausserrhoden|Appenzell Innerrhoden|Basel-Landschaft|Basel-Stadt|Bern|Fribourg|Geneva|Glarus|Graubünden|Jura|Lucerne|Neuchâtel|Nidwalden|Obwalden|Schaffhausen|Schwyz|Solothurn|St. Gallen|Thurgau|Ticino|Uri|Valais|Vaud|Zug|Zurich",
  AT: "Burgenland|Carinthia|Lower Austria|Salzburg|Styria|Tyrol|Upper Austria|Vienna|Vorarlberg",
  AU: "Australian Capital Territory|New South Wales|Northern Territory|Queensland|South Australia|Tasmania|Victoria|Western Australia",
  NZ: "Auckland|Bay of Plenty|Canterbury|Gisborne|Hawke's Bay|Manawatū-Whanganui|Marlborough|Nelson|Northland|Otago|Southland|Taranaki|Tasman|Waikato|Wellington|West Coast",
  IN: "Andaman and Nicobar Islands|Andhra Pradesh|Arunachal Pradesh|Assam|Bihar|Chandigarh|Chhattisgarh|Dadra and Nagar Haveli and Daman and Diu|Delhi|Goa|Gujarat|Haryana|Himachal Pradesh|Jammu and Kashmir|Jharkhand|Karnataka|Kerala|Ladakh|Lakshadweep|Madhya Pradesh|Maharashtra|Manipur|Meghalaya|Mizoram|Nagaland|Odisha|Puducherry|Punjab|Rajasthan|Sikkim|Tamil Nadu|Telangana|Tripura|Uttar Pradesh|Uttarakhand|West Bengal",
  JP: "Aichi|Akita|Aomori|Chiba|Ehime|Fukui|Fukuoka|Fukushima|Gifu|Gunma|Hiroshima|Hokkaido|Hyogo|Ibaraki|Ishikawa|Iwate|Kagawa|Kagoshima|Kanagawa|Kochi|Kumamoto|Kyoto|Mie|Miyagi|Miyazaki|Nagano|Nagasaki|Nara|Niigata|Oita|Okayama|Okinawa|Osaka|Saga|Saitama|Shiga|Shimane|Shizuoka|Tochigi|Tokushima|Tokyo|Tottori|Toyama|Wakayama|Yamagata|Yamaguchi|Yamanashi",
  CN: "Anhui|Beijing|Chongqing|Fujian|Gansu|Guangdong|Guangxi|Guizhou|Hainan|Hebei|Heilongjiang|Henan|Hubei|Hunan|Inner Mongolia|Jiangsu|Jiangxi|Jilin|Liaoning|Ningxia|Qinghai|Shaanxi|Shandong|Shanghai|Shanxi|Sichuan|Tianjin|Tibet|Xinjiang|Yunnan|Zhejiang",
  ZA: "Eastern Cape|Free State|Gauteng|KwaZulu-Natal|Limpopo|Mpumalanga|North West|Northern Cape|Western Cape",
};

export const REGION_COUNTRIES = Object.keys(LISTS);

/** Every list, for a form that has a dropdown following a country field. */
export const allRegions = (): Record<string, string[]> => Object.fromEntries(REGION_COUNTRIES.map((c) => [c, regionsOf(c)!]));

/** Whether a form needs the lists. */
export const usesRegions = (form: { steps: { fields: { optionsBy?: { preset?: string } }[] }[] }) => form.steps.some((s) => s.fields.some((f) => f.optionsBy?.preset === "regions"));

const cache = new Map<string, string[]>();

/** The regions of a country, or undefined when we have no list for it (the dropdown then doesn't show). */
export function regionsOf(country: string): string[] | undefined {
  const c = country.toUpperCase();
  if (!LISTS[c]) return undefined;
  if (!cache.has(c)) cache.set(c, LISTS[c]!.split("|"));
  return cache.get(c);
}
