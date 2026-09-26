#!/usr/bin/env node
// Normalizes Yupoo supplier album titles (English, structured but noisy) into the attributes our
// catalog uses: sport, league, team (canonical slug), season, kit, audience, version, sleeve,
// product type, retro flag, plus basketball player/number/edition. No dependencies, so the import
// pipeline can reuse it.
//
// Usage:
//   node scripts/catalog/yupoo-normalize.mjs [--in <crawl.json>] [--out <albums.json>] [--store jerseyxie]
//        [--classification <classification.json>]
// Defaults: --in qa-output/<store>-cache/crawl.json (written by yupoo-crawl.mjs),
//           --out catalog/sources/<store>/albums.json, --classification catalog/classification.json.
// Prints the titles it could not parse (no team for a team product, or an ambiguous team name).
//
// As a module: import { normalizeTitle, normalizeAlbum, parseSeason, fold } from './yupoo-normalize.mjs'
//
// Team slugs: catalog/classification.json is the canonical naming; teams it does not list get a
// kebab-case slug of their English name from the TEAMS table below. Leagues are the club's league
// in 2025-26; lower divisions are grouped per country (efl, segunda-division, serie-b,
// 2-bundesliga, ligue-2).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------
// Leagues: slug | sport | name
const LEAGUE_TABLE = `
premier-league|football|Premier League
efl|football|English Football League
la-liga|football|LaLiga
segunda-division|football|Spain, lower divisions
serie-a|football|Serie A
serie-b|football|Italy, lower divisions
bundesliga|football|Bundesliga
2-bundesliga|football|Germany, lower divisions
ligue-1|football|Ligue 1
ligue-2|football|France, lower divisions
primeira-liga|football|Primeira Liga
eredivisie|football|Eredivisie
scottish-premiership|football|Scottish Premiership
saudi-pro-league|football|Saudi Pro League
mls|football|MLS
liga-mx|football|Liga MX
brasileirao|football|Brasileirão
argentine-primera|football|Argentine Primera División
chilean-primera|football|Chilean Primera División
colombian-primera|football|Colombian Primera A
uruguayan-primera|football|Uruguayan Primera División
paraguayan-primera|football|Paraguayan Primera División
peruvian-liga-1|football|Peruvian Liga 1
ecuadorian-serie-a|football|Ecuadorian Serie A
j1-league|football|J1 League
k-league|football|K League
a-league|football|A-League
super-lig|football|Süper Lig
greek-super-league|football|Greek Super League
belgian-pro-league|football|Belgian Pro League
serbian-superliga|football|Serbian SuperLiga
croatian-hnl|football|Croatian HNL
austrian-bundesliga|football|Austrian Bundesliga
swiss-super-league|football|Swiss Super League
danish-superliga|football|Danish Superliga
allsvenskan|football|Allsvenskan
eliteserien|football|Eliteserien
russian-premier-league|football|Russian Premier League
ukrainian-premier-league|football|Ukrainian Premier League
ekstraklasa|football|Ekstraklasa
liga-i|football|Liga I
league-of-ireland|football|League of Ireland
nifl-premiership|football|NIFL Premiership
south-african-psl|football|South African PSL
egyptian-premier-league|football|Egyptian Premier League
algerian-ligue-1|football|Algerian Ligue 1
botola|football|Botola Pro
tanzanian-premier-league|football|Tanzanian Premier League
malaysia-super-league|football|Malaysia Super League
liga-1-indonesia|football|Liga 1 Indonesia
honduran-liga|football|Honduran Liga Nacional
costa-rican-primera|football|Costa Rican Primera División
qatar-stars-league|football|Qatar Stars League
uae-pro-league|football|UAE Pro League
israeli-premier-league|football|Israeli Premier League
kings-league|football|Kings League
national-teams|football|National Teams
nba|basketball|NBA
wnba|basketball|WNBA
basketball-other|basketball|Basketball, other
nfl|american-football|NFL
mlb|other|Baseball (MLB and other)
nhl|other|NHL (ice hockey)
f1|other|Formula 1 and motorsport
rugby|other|Rugby
afl|other|AFL (Australian football)
`;

// Teams: slug | league | English name | aliases (;-separated). Aliases match whole words, ignoring
// case, accents and hyphens ("M-anchester U-nited" is listed because the supplier obfuscates some
// trademarked names). A slug starting with "?" marks an ambiguous name: it is kept for grouping but
// the album is listed for review.
const TEAM_TABLE = `
arsenal|premier-league|Arsenal|Ar-senal;A-rsenal;Arsenal FC
aston-villa|premier-league|Aston Villa|As-ton Vi-lla;Aston Vera
bournemouth|premier-league|AFC Bournemouth|Bournemouth
brentford|premier-league|Brentford
brighton|premier-league|Brighton & Hove Albion|Brighton;Brighton and Hove Albion
burnley|premier-league|Burnley
chelsea|premier-league|Chelsea|Ch-elsea;Chelsea FC
crystal-palace|premier-league|Crystal Palace
everton|premier-league|Everton
fulham|premier-league|Fulham
leeds-united|premier-league|Leeds United|Leeds;Leed United;Le-eds Un-ited
liverpool|premier-league|Liverpool|Li-verpool;Liver-pool;LFC
manchester-city|premier-league|Manchester City|Man City;Manchester City FC;Oasis
manchester-united|premier-league|Manchester United|Man United;Man Utd;Man Uited;M-anchester U-nited;Manchester Utd;Manchester United FC
newcastle-united|premier-league|Newcastle United|Newcastle
nottingham-forest|premier-league|Nottingham Forest|Nottingham;Nottingham Forester
sunderland|premier-league|Sunderland
tottenham-hotspur|premier-league|Tottenham Hotspur|Tottenham;To-ttenham;Spurs
west-ham-united|premier-league|West Ham United|West Ham;We-st H-am;Iron Maiden
wolverhampton-wanderers|premier-league|Wolverhampton Wanderers|Wolverhampton;Wolves;Wolve;Wolvers
leicester-city|efl|Leicester City|Leicester
southampton|efl|Southampton
ipswich-town|efl|Ipswich Town|Ipswich;Ipswich Town F.C
sheffield-united|efl|Sheffield United|Sheffield
sheffield-wednesday|efl|Sheffield Wednesday
stoke-city|efl|Stoke City|Stoke
plymouth-argyle|efl|Plymouth Argyle|Plymouth
birmingham-city|efl|Birmingham City|Birmingham
coventry-city|efl|Coventry City|Coventry;Coventry F.C
middlesbrough|efl|Middlesbrough|Middel
wrexham|efl|Wrexham
hull-city|efl|Hull City|Hull
bolton-wanderers|efl|Bolton Wanderers|Bolton
blackburn-rovers|efl|Blackburn Rovers|Blackburn
derby-county|efl|Derby County|Derby;Derbyshire
norwich-city|efl|Norwich City|Norwich
portsmouth|efl|Portsmouth|Portsmoutho
west-bromwich-albion|efl|West Bromwich Albion|West Bromwich;West Brom
cardiff-city|efl|Cardiff City|Cardiff
swansea-city|efl|Swansea City|Swansea
queens-park-rangers|efl|Queens Park Rangers|QPR;Queens Park
watford|efl|Watford|Watford F.C
preston-north-end|efl|Preston North End|Preston;Preston North End F.C
bristol-city|efl|Bristol City|Bristol
millwall|efl|Millwall
luton-town|efl|Luton Town|Luton
charlton-athletic|efl|Charlton Athletic|Charlton
huddersfield-town|efl|Huddersfield Town|Huddersfield
reading|efl|Reading
blackpool|efl|Blackpool
bradford-city|efl|Bradford City|Bradford
port-vale|efl|Port Vale
rotherham-united|efl|Rotherham United|Rotherham
afc-wimbledon|efl|AFC Wimbledon|Wimbledon
northampton-town|efl|Northampton Town|Northampton
lincoln-city|efl|Lincoln City|Lincoln;Lincoln City F.C;Lincoln F.C
doncaster-rovers|efl|Doncaster Rovers|Doncaster
walsall|efl|Walsall
hartlepool-united|efl|Hartlepool United
hashtag-united|efl|Hashtag United|HashTag United
alaves|la-liga|Deportivo Alavés|Alaves;Deportivo Alaves;Alavis
athletic-bilbao|la-liga|Athletic Bilbao|Bilbao;Athletic Club;Bilba
atletico-madrid|la-liga|Atlético Madrid|Atletico Madrid;Atletico de Madrid;Atleti
barcelona|la-liga|FC Barcelona|Barcelona;Barc;Barca;FC Barcelona
celta-vigo|la-liga|Celta Vigo|Celta;Celta de Vigo
elche|la-liga|Elche|Elche CF
espanyol|la-liga|RCD Espanyol|Espanyol;RCD Espanyol;Spanish
getafe|la-liga|Getafe
girona|la-liga|Girona|Gerona
levante|la-liga|Levante|Levante UD
mallorca|la-liga|RCD Mallorca|Mallorca
osasuna|la-liga|Osasuna|Qsasuna
rayo-vallecano|la-liga|Rayo Vallecano|Vallecano
real-betis|la-liga|Real Betis|Betis
real-madrid|la-liga|Real Madrid|R-eal Ma-drid;Re-al Ma-drid;Real Madridn;Real Madird;Real Ma-drid
real-oviedo|la-liga|Real Oviedo|Oviedo
real-sociedad|la-liga|Real Sociedad|Sociedad
sevilla|la-liga|Sevilla|Sevilla FC
valencia|la-liga|Valencia|Va-lencia
villarreal|la-liga|Villarreal
las-palmas|segunda-division|UD Las Palmas|Las Palmas
real-valladolid|segunda-division|Real Valladolid|Valladolid
leganes|segunda-division|Leganés|Leganes
deportivo-la-coruna|segunda-division|Deportivo La Coruña|Deportivo;La Coruna;La Corua;Coruna;Deportivo La Coruna
racing-santander|segunda-division|Racing Santander|Racing de Santander
real-zaragoza|segunda-division|Real Zaragoza|Zaragoza
malaga|segunda-division|Málaga|Malaga
granada|segunda-division|Granada
cadiz|segunda-division|Cádiz|Cadiz
almeria|segunda-division|UD Almería|Almeria;UD Almeria
sporting-gijon|segunda-division|Sporting Gijón|Sporting de Gijon;Gijon;Sporting gij;Sporting Gijon
albacete|segunda-division|Albacete
tenerife|segunda-division|Tenerife
burgos|segunda-division|Burgos
cordoba|segunda-division|Córdoba|Cordoba;Cordoba CF
mirandes|segunda-division|Mirandés|Mirandes
castellon|segunda-division|Castellón|Castellon
ceuta|segunda-division|AD Ceuta|Ceuta
cultural-leonesa|segunda-division|Cultural Leonesa|Leonesa
real-murcia|segunda-division|Real Murcia|Murcia
hercules|segunda-division|Hércules|Hercules
recreativo-huelva|segunda-division|Recreativo de Huelva|Recreativo
atalanta|serie-a|Atalanta
bologna|serie-a|Bologna
cagliari|serie-a|Cagliari
como|serie-a|Como|Come
cremonese|serie-a|Cremonese|Cremona
fiorentina|serie-a|Fiorentina|ACF Fiorentina;Fi-orentina
genoa|serie-a|Genoa
hellas-verona|serie-a|Hellas Verona|Verona
inter-milan|serie-a|Inter Milan|Inter;In-ter Mi-lan;Internazionale;Inter Milano
juventus|serie-a|Juventus|Juve
lazio|serie-a|Lazio|La-zio
lecce|serie-a|Lecce
ac-milan|serie-a|AC Milan|Milan;A-C;AC;A C Milan
napoli|serie-a|Napoli|Naples;Na-ples;SSC Napoli
parma|serie-a|Parma|Pa-rma
pisa|serie-a|Pisa
as-roma|serie-a|AS Roma|Roma;Roman;Rome;Ro-me
sassuolo|serie-a|Sassuolo
torino|serie-a|Torino|Turin
udinese|serie-a|Udinese
venezia|serie-b|Venezia|Venice
palermo|serie-b|Palermo
sampdoria|serie-b|Sampdoria
bari|serie-b|Bari|SSC Bari
brescia|serie-b|Brescia|Brescia Calcio
salernitana|serie-b|Salernitana
empoli|serie-b|Empoli
monza|serie-b|Monza
modena|serie-b|Modena
perugia|serie-b|Perugia
ravenna|serie-b|Ravenna
augsburg|bundesliga|FC Augsburg|Augsburg
union-berlin|bundesliga|Union Berlin|Berlin Union
werder-bremen|bundesliga|Werder Bremen|Bremen;Werder
borussia-dortmund|bundesliga|Borussia Dortmund|Dortmund;Dotmund;Dor-tmund;BVB
eintracht-frankfurt|bundesliga|Eintracht Frankfurt|Frankfurt
freiburg|bundesliga|SC Freiburg|Freiburg
hamburger-sv|bundesliga|Hamburger SV|Hamburger;Hamburg
heidenheim|bundesliga|Heidenheim
hoffenheim|bundesliga|Hoffenheim
fc-koln|bundesliga|1. FC Köln|Koln;Kln;FC Koln;Kolner;Cologne
rb-leipzig|bundesliga|RB Leipzig|Leipzig;Red Bull Leipzig;Bull Leipzig
bayer-leverkusen|bundesliga|Bayer Leverkusen|Leverkusen
mainz-05|bundesliga|Mainz 05|Mainz;FSV Mainz 05
borussia-monchengladbach|bundesliga|Borussia Mönchengladbach|Monchengladbach;Mnchengladbach;Gladbach;Borussia Monchengladbach
bayern-munich|bundesliga|Bayern Munich|Bayern;FC Bayern;Bayern Munchen
st-pauli|bundesliga|FC St. Pauli|St Pauli;St.Pauli;St Paul;St.Paul
vfb-stuttgart|bundesliga|VfB Stuttgart|Stuttgart
vfl-wolfsburg|bundesliga|VfL Wolfsburg|Wolfsburg
schalke-04|2-bundesliga|Schalke 04|Schalke
hertha-bsc|2-bundesliga|Hertha BSC|Hertha;Berlin
hannover-96|2-bundesliga|Hannover 96|Hannover;Hanover
kaiserslautern|2-bundesliga|1. FC Kaiserslautern|Kaiserslautern
fortuna-dusseldorf|2-bundesliga|Fortuna Düsseldorf|Dusseldorf
nurnberg|2-bundesliga|1. FC Nürnberg|Nuremberg;Nurnberg;Nur emberg
hansa-rostock|2-bundesliga|Hansa Rostock|Hansa
arminia-bielefeld|2-bundesliga|Arminia Bielefeld|Bielefeld
holstein-kiel|2-bundesliga|Holstein Kiel
vfl-bochum|2-bundesliga|VfL Bochum|Bochum
magdeburg|2-bundesliga|1. FC Magdeburg|Magdeburg
karlsruher-sc|2-bundesliga|Karlsruher SC|Karlsruher;Karlsruhe
greuther-furth|2-bundesliga|Greuther Fürth|Greuther;SpVgg Greuther Furth
tsv-1860-munich|2-bundesliga|TSV 1860 Munich|1860 Munich;Munich 1860
dynamo-dresden|2-bundesliga|Dynamo Dresden|Dresden
preussen-munster|2-bundesliga|Preußen Münster|Preu_en Munster;Prussia Munster;Preussen Munster
rot-weiss-essen|2-bundesliga|Rot-Weiss Essen
carl-zeiss-jena|2-bundesliga|Carl Zeiss Jena|Carl Zeiss
angers|ligue-1|Angers
auxerre|ligue-1|Auxerre
brest|ligue-1|Stade Brestois|Brestois;Brest
le-havre|ligue-1|Le Havre
lens|ligue-1|RC Lens|Lens
lille|ligue-1|Lille
lorient|ligue-1|Lorient
lyon|ligue-1|Olympique Lyonnais|Lyon;Lyons;Olympique Lyon
olympique-marseille|ligue-1|Olympique de Marseille|Marseille;Marseilles;Mar-seille
metz|ligue-1|Metz
monaco|ligue-1|AS Monaco|Monaco
nantes|ligue-1|Nantes
nice|ligue-1|OGC Nice|Nice
paris-fc|ligue-1|Paris FC
paris-saint-germain|ligue-1|Paris Saint-Germain|Paris;PSG;P-aris;Pairs;Paris Saint Germain
rennes|ligue-1|Stade Rennais|Rennes;Rennais
strasbourg|ligue-1|Strasbourg
toulouse|ligue-1|Toulouse
saint-etienne|ligue-2|Saint-Étienne|Saint Etienne;Saint-etienn;St Etienne
reims|ligue-2|Stade de Reims|Reims
bordeaux|ligue-2|Bordeaux
versailles|ligue-2|FC Versailles|Versailles
benfica|primeira-liga|Benfica
porto|primeira-liga|FC Porto|Porto;Portto;FC Porto
sporting-cp|primeira-liga|Sporting CP|Sporting Lisbon;Lisbon;Lisboa;Sporting;Sporting Lisboa;Sporting CP
braga|primeira-liga|SC Braga|Braga
vitoria-guimaraes|primeira-liga|Vitória Guimarães|Guimaraes;Vitoria Guimaraes;Vitoria de Guimaraes;Vitoria
estoril|primeira-liga|Estoril Praia|Estoril;Estoril Praia;G.D. Estoril Praia
alverca|primeira-liga|Alverca
ajax|eredivisie|Ajax|A-jax
psv|eredivisie|PSV Eindhoven|PSV;Eindhoven
feyenoord|eredivisie|Feyenoord|Fe-yenoord
az-alkmaar|eredivisie|AZ Alkmaar|Alkmaar;AZ
twente|eredivisie|FC Twente|Twente
utrecht|eredivisie|FC Utrecht|Utrecht
heerenveen|eredivisie|Heerenveen
pec-zwolle|eredivisie|PEC Zwolle|Zwolle
celtic|scottish-premiership|Celtic|Cletic;Celtci;Celtic FC;Celtics
rangers|scottish-premiership|Rangers|Ranger;Glasgow Rangers;Rangers FC
aberdeen|scottish-premiership|Aberdeen|Aberdeen F.C
hearts|scottish-premiership|Heart of Midlothian|Hearts;Heart
hibernian|scottish-premiership|Hibernian
dundee|scottish-premiership|Dundee
ayr-united|scottish-premiership|Ayr United
al-nassr|saudi-pro-league|Al Nassr|Al-Nassr;Al-Nass;Alnassr
al-hilal|saudi-pro-league|Al Hilal|Al-Hilal;Al-Hilal Saudi
al-ittihad|saudi-pro-league|Al Ittihad|Al-Ittihad;Ittihad
al-ahli|saudi-pro-league|Al Ahli|Al-Ahli;Al-Ahli Saudi
inter-miami|mls|Inter Miami|Miami;Inter Miami CF
la-galaxy|mls|LA Galaxy|Los Angeles Galaxy;Galaxy
lafc|mls|Los Angeles FC|LAFC;Los Angeles
new-york-city-fc|mls|New York City FC|New York City;NYCFC;76New York City
new-york-red-bulls|mls|New York Red Bulls|New York Red Bull;New York Bull;New York Bulls;York Red Bull;Red Bulls
san-diego-fc|mls|San Diego FC|San Diego
austin-fc|mls|Austin FC|Austin
charlotte-fc|mls|Charlotte FC|Charlotte
orlando-city|mls|Orlando City|Orlando
vancouver-whitecaps|mls|Vancouver Whitecaps|Vancouver;Whitecaps
new-england-revolution|mls|New England Revolution|New England
cf-montreal|mls|CF Montréal|Montreal;CF Montreal
columbus-crew|mls|Columbus Crew|Columbus;Columbus Crewm
toronto-fc|mls|Toronto FC|Toronto
nashville-sc|mls|Nashville SC|Nashville
san-jose-earthquakes|mls|San Jose Earthquakes|San Jose
portland-timbers|mls|Portland Timbers|Portland
philadelphia-union|mls|Philadelphia Union|Philadelphia
real-salt-lake|mls|Real Salt Lake|Salt Lake
st-louis-city|mls|St. Louis City SC|St Louis City;St Louis;Louis;Saint Louis;St louis City Sc
minnesota-united|mls|Minnesota United|Minnesota
sporting-kansas-city|mls|Sporting Kansas City|Kansas City;Kansas;Sporting Kansas
dc-united|mls|D.C. United|DC United;D.C. United;D C U nite;D.C.U.nite;Washington
fc-cincinnati|mls|FC Cincinnati|Cincinnati;Cincinati
chicago-fire|mls|Chicago Fire|Chicago
houston-dynamo|mls|Houston Dynamo|Houston Dynamo FC;Houston;Dynamo
colorado-rapids|mls|Colorado Rapids|Colorado
seattle-sounders|mls|Seattle Sounders|Seattle
fc-dallas|mls|FC Dallas|Dallas
atlanta-united|mls|Atlanta United|Atlanta;Atalanta United
tampa-bay-mutiny|mls|Tampa Bay Mutiny
club-america|liga-mx|Club América|America;Club America;CA America;Americas;American
chivas|liga-mx|Chivas Guadalajara|Chivas;Chiva;Guadalajara
cruz-azul|liga-mx|Cruz Azul
tigres|liga-mx|Tigres UANL|Tigres
monterrey|liga-mx|Monterrey|Monterey;Rayados
pumas-unam|liga-mx|Pumas UNAM|Pumas;UNAM;Club Universidad Nacional
toluca|liga-mx|Toluca
tijuana|liga-mx|Club Tijuana|Tijuana;Xolos
pachuca|liga-mx|Pachuca
club-leon|liga-mx|Club León|Leon;Club Leon
atlas|liga-mx|Atlas
necaxa|liga-mx|Necaxa
puebla|liga-mx|Puebla|Puebla Futbol
queretaro|liga-mx|Querétaro|Queretaro
juarez|liga-mx|FC Juárez|Juarez
mazatlan|liga-mx|Mazatlán FC|Mazatlan;Mazatlan FC
santos-laguna|liga-mx|Santos Laguna
atletico-san-luis|liga-mx|Atlético San Luis|San Luis;Atletico San Luis
atlante|liga-mx|Atlante
leones-negros|liga-mx|Leones Negros
murcielagos|liga-mx|Murciélagos FC|Murcielagos
flamengo|brasileirao|Flamengo|F-lamengo;F-lamenco;Flamenco;Fla-menco
palmeiras|brasileirao|Palmeiras
corinthians|brasileirao|Corinthians|Corinthian
sao-paulo|brasileirao|São Paulo|Sao Paulo;So Paulo;Sao Paolo
santos|brasileirao|Santos
fluminense|brasileirao|Fluminense
botafogo|brasileirao|Botafogo
vasco-da-gama|brasileirao|Vasco da Gama|Vasco
gremio|brasileirao|Grêmio|Gremio
internacional|brasileirao|Internacional|Club Internacional
cruzeiro|brasileirao|Cruzeiro
atletico-mineiro|brasileirao|Atlético Mineiro|Atletico Mineiro;Mineiro
bahia|brasileirao|Bahia
fortaleza|brasileirao|Fortaleza
athletico-paranaense|brasileirao|Athletico Paranaense|Paranaense;Club Athletico Paranaense;Athletico
vitoria|brasileirao|Vitória|Victoria;Vitoria;Vitoria BR
sport-recife|brasileirao|Sport Recife|Recife;Recife Sports
ceara|brasileirao|Ceará|Ceara
bragantino|brasileirao|Red Bull Bragantino|Bragantino;Bull Bragantino
santa-cruz|brasileirao|Santa Cruz
criciuma|brasileirao|Criciúma|Criciuma
paysandu|brasileirao|Paysandu|Paysandu Para
volta-redonda|brasileirao|Volta Redonda|Volta Redonda FC
guarani|brasileirao|Guarani
avai|brasileirao|Avaí|Avai
coritiba|brasileirao|Coritiba
goias|brasileirao|Goiás|Goias
nautico|brasileirao|Náutico|Nautico;Clube Nautico
remo|brasileirao|Clube do Remo|Remo
chapecoense|brasileirao|Chapecoense|Chapeco
figueirense|brasileirao|Figueirense
crb|brasileirao|CRB
atletico-goianiense|brasileirao|Atlético Goianiense|Atletico Clube Goianiense;Atletico Goianiense
portuguesa|brasileirao|Portuguesa
boca-juniors|argentine-primera|Boca Juniors|Boca;Bo-ca
river-plate|argentine-primera|River Plate|River
independiente|argentine-primera|Independiente|Atletico Independiente;Club Atletico Independiente
racing-club|argentine-primera|Racing Club|Racing Club de Avellaneda;Avellaneda;Racing
estudiantes|argentine-primera|Estudiantes de La Plata|Estudiantes;Estudiantes de La
san-lorenzo|argentine-primera|San Lorenzo
argentinos-juniors|argentine-primera|Argentinos Juniors
huracan|argentine-primera|Huracán|Huracan
lanus|argentine-primera|Lanús|Lanus
newells-old-boys|argentine-primera|Newell's Old Boys|Newells Old Boys;Newell Old Boy;Newells
rosario-central|argentine-primera|Rosario Central|Rosario
velez-sarsfield|argentine-primera|Vélez Sarsfield|Velez;Sarsfield;Atletico Velez Sarsfield;Velez Sarsfield
tigre|argentine-primera|Tigre
belgrano|argentine-primera|Belgrano|Belgrano Cba
barracas-central|argentine-primera|Barracas Central
atletico-tucuman|argentine-primera|Atlético Tucumán|Tucuman
colo-colo|chilean-primera|Colo-Colo|Colo;Colo-Colo FC
universidad-de-chile|chilean-primera|Universidad de Chile|Club Universidad de Chile;University Chile;University of Chile;U de Chile
universidad-catolica|chilean-primera|Universidad Católica|Universidad Catolica;Deportivo Universidad Catolica;Club Deportivo Universidad;Catolica;Catholic
palestino|chilean-primera|Palestino
santiago-wanderers|chilean-primera|Santiago Wanderers
deportes-concepcion|chilean-primera|Deportes Concepción|Concepcion
atletico-nacional|colombian-primera|Atlético Nacional|Atletico Nacional;National Athletic
millonarios|colombian-primera|Millonarios|Millionarios;Millionaire;Millonarios Bogota
junior-barranquilla|colombian-primera|Junior de Barranquilla|Barranquilla;Barranquilla Junior;Atletico Junior
santa-fe|colombian-primera|Independiente Santa Fe|Santa Fe
independiente-medellin|colombian-primera|Independiente Medellín|Independiente Medellin
deportivo-pereira|colombian-primera|Deportivo Pereira|Pereira Deportivo;Pereira
penarol|uruguayan-primera|Peñarol|Penarol;Pearol;Atletico Penarol;Atletico Pearol
nacional-uruguay|uruguayan-primera|Club Nacional|Club Nacional;Nacional;Club Nacional de
cerro-porteno|paraguayan-primera|Cerro Porteño|Cerro Porteno
olimpia|paraguayan-primera|Olimpia|Olympia
alianza-lima|peruvian-liga-1|Alianza Lima|Club Alianza Lima;Lima
universitario|peruvian-liga-1|Universitario|Universitario de Deportes;University Peru
sporting-cristal|peruvian-liga-1|Sporting Cristal
emelec|ecuadorian-serie-a|Emelec|Club Sport Emelec
vissel-kobe|j1-league|Vissel Kobe
kashima-antlers|j1-league|Kashima Antlers
yokohama-f-marinos|j1-league|Yokohama F. Marinos|Yokohama Marinos;Marinos;Yokohama;Yokohama F Marinos
yokohama-fc|j1-league|Yokohama FC
gamba-osaka|j1-league|Gamba Osaka
cerezo-osaka|j1-league|Cerezo Osaka
kawasaki-frontale|j1-league|Kawasaki Frontale|Kawasaki;Kawasaki Forwards
consadole-sapporo|j1-league|Hokkaido Consadole Sapporo|Consadole Sapporo;Norbritz Hokkaido;Hokkaido
tokyo-verdy|j1-league|Tokyo Verdy
fc-tokyo|j1-league|FC Tokyo|Tokyo
kyoto-sanga|j1-league|Kyoto Sanga
avispa-fukuoka|j1-league|Avispa Fukuoka
kashiwa-reysol|j1-league|Kashiwa Reysol
shimizu-s-pulse|j1-league|Shimizu S-Pulse|Shimizu S-Puls;Shizumi Pulse
urawa-red-diamonds|j1-league|Urawa Red Diamonds|Urawa Reds;Urawa Diamond;Urawa Red Diamond;Urawa Diamonds;Red Diamonds;Diamonds
nagoya-grampus|j1-league|Nagoya Grampus
jubilo-iwata|j1-league|Júbilo Iwata|Jubilo Iwata
sanfrecce-hiroshima|j1-league|Sanfrecce Hiroshima|Hiroshima Sanfrecce;Hiroshima
sagan-tosu|j1-league|Sagan Tosu|Sagantosu
oita-trinita|j1-league|Oita Trinita
albirex-niigata|j1-league|Albirex Niigata
jef-united-chiba|j1-league|JEF United Chiba|Ichihara Chiba
fc-seoul|k-league|FC Seoul|Seoul
ulsan-hyundai|k-league|Ulsan Hyundai
suwon-samsung-bluewings|k-league|Suwon Samsung Bluewings|Suwon
suwon-fc|k-league|Suwon FC
pohang-steelers|k-league|Pohang Steelers
melbourne-victory|a-league|Melbourne Victory|Melbourne
adelaide-united|a-league|Adelaide United
central-coast-mariners|a-league|Central Coast Mariners
sydney-fc|a-league|Sydney FC|Sydney
galatasaray|super-lig|Galatasaray
fenerbahce|super-lig|Fenerbahçe|Fenerbahce
besiktas|super-lig|Beşiktaş|Besiktas;Besiktas J.K;Beikta;Bessitasa
trabzonspor|super-lig|Trabzonspor|Trabzon
olympiacos|greek-super-league|Olympiacos|Olympics;Olympiakos
panathinaikos|greek-super-league|Panathinaikos
aek-athens|greek-super-league|AEK Athens
anderlecht|belgian-pro-league|Anderlecht|R.S.C. Anderlecht;RSC Anderlecht
club-brugge|belgian-pro-league|Club Brugge|Brugge
standard-liege|belgian-pro-league|Standard Liège|Standard Liege
red-star-belgrade|serbian-superliga|Red Star Belgrade|Belgrade;Crvena Zvezda;Red Star
dinamo-zagreb|croatian-hnl|Dinamo Zagreb
hajduk-split|croatian-hnl|Hajduk Split|Split
red-bull-salzburg|austrian-bundesliga|Red Bull Salzburg|Salzburg;Bull Salzburg
basel|swiss-super-league|FC Basel|Basel
servette|swiss-super-league|Servette
fc-copenhagen|danish-superliga|FC Copenhagen|Copenhagen;Coppenhagen;Kobenhavn;Coppenhagen Kbenhavn
aik|allsvenskan|AIK|AIK Solna;Aik Sonina;ALK
malmo|allsvenskan|Malmö FF|Malmo
djurgarden|allsvenskan|Djurgården|Djurgardens;Djurgarden
bodo-glimt|eliteserien|Bodø/Glimt|Bodo Glimt;BodoGlimt;Bodo_Glimt
zenit|russian-premier-league|Zenit Saint Petersburg|Zenit
shakhtar-donetsk|ukrainian-premier-league|Shakhtar Donetsk|Shakhtar;Donetsk
legia-warsaw|ekstraklasa|Legia Warsaw|Legia Warszawa;Legia
fcsb|liga-i|FCSB
st-patricks-athletic|league-of-ireland|St Patrick's Athletic|St Patricks;St Patrick s
bohemians|league-of-ireland|Bohemians|Bohemian;Bohemian F.C;Bohemia
shamrock-rovers|league-of-ireland|Shamrock Rovers
waterford|league-of-ireland|Waterford
cork-city|league-of-ireland|Cork City|Cork
cliftonville|nifl-premiership|Cliftonville
linfield|nifl-premiership|Linfield
kaizer-chiefs|south-african-psl|Kaizer Chiefs|Kaizer
orlando-pirates|south-african-psl|Orlando Pirates
mamelodi-sundowns|south-african-psl|Mamelodi Sundowns|Mamelodi
al-ahly|egyptian-premier-league|Al Ahly|Al-Ahly;El Ahly;AlAhly
mc-alger|algerian-ligue-1|MC Alger|MC Algiers;Alger;Algiers
usm-alger|algerian-ligue-1|USM Alger|USM
js-kabylie|algerian-ligue-1|JS Kabylie|Kabylie
wydad|botola|Wydad AC|Wydad
young-africans|tanzanian-premier-league|Young Africans
johor-darul-tazim|malaysia-super-league|Johor Darul Ta'zim|Johor;Johore;Johor DT;Johor Darul Tazim;Johore Darul Ta zim
selangor|malaysia-super-league|Selangor
penang|malaysia-super-league|Penang
sabah|malaysia-super-league|Sabah
persija-jakarta|liga-1-indonesia|Persija Jakarta
psis-semarang|liga-1-indonesia|PSIS Semarang
motagua|honduran-liga|Motagua
saprissa|costa-rican-primera|Saprissa
al-wakrah|qatar-stars-league|Al-Wakrah
al-ain|uae-pro-league|Al Ain
maccabi-haifa|israeli-premier-league|Maccabi Haifa
maccabi-tel-aviv|israeli-premier-league|Maccabi Tel Aviv
hapoel-tel-aviv|israeli-premier-league|Hapoel Tel Aviv
beitar-jerusalem|israeli-premier-league|Beitar Jerusalem|Jerusalem;Yerushalayim
hapoel-beer-sheva|israeli-premier-league|Hapoel Be'er Sheva|Hapoel Beer Sheva
hapoel-petah-tikva|israeli-premier-league|Hapoel Petah Tikva
?tel-aviv|israeli-premier-league|Tel Aviv (Maccabi or Hapoel?)|Tel Aviv
?maccabi|israeli-premier-league|Maccabi (which club?)|Maccabi
kings-league|kings-league|Kings League|Kings;Sevens Kings League;Kings League;Sevens league
1k-fc|kings-league|1K FC|1K FC Kings League
saiyans-fc|kings-league|Saiyans FC
pio-fc|kings-league|PIO FC
el-barrio|kings-league|El Barrio
ultimate-mostoles|kings-league|Ultimate Móstoles|Ultimate Mostoles
porcinos-fc|kings-league|Porcinos FC|Pig Teammate
argentina|national-teams|Argentina|Argentin;Aargentina;Ar-gentina;Argentine
italy|national-teams|Italy|I-taly;Italia
france|national-teams|France|Frace
brazil|national-teams|Brazil|Brasil
spain|national-teams|Spain|Espana
england|national-teams|England
germany|national-teams|Germany
east-germany|national-teams|East Germany|DDR
mexico|national-teams|Mexico
portugal|national-teams|Portugal|Por-tugal;Portutal
japan|national-teams|Japan
scotland|national-teams|Scotland
ireland|national-teams|Republic of Ireland|Ireland
northern-ireland|national-teams|Northern Ireland|North Ireland
netherlands|national-teams|Netherlands|Netherland;Holland;Ne-therlands
nigeria|national-teams|Nigeria|Nigerian
belgium|national-teams|Belgium
croatia|national-teams|Croatia
colombia|national-teams|Colombia|Columbia
algeria|national-teams|Algeria
palestine|national-teams|Palestine
denmark|national-teams|Denmark
india|national-teams|India
uruguay|national-teams|Uruguay
egypt|national-teams|Egypt
tunisia|national-teams|Tunisia
australia|national-teams|Australia
jamaica|national-teams|Jamaica
el-salvador|national-teams|El Salvador|Salvador
ghana|national-teams|Ghana
venezuela|national-teams|Venezuela
cameroon|national-teams|Cameroon
albania|national-teams|Albania|Republic of Albania;Republic Albania
romania|national-teams|Romania
guatemala|national-teams|Guatemala
armenia|national-teams|Armenia
morocco|national-teams|Morocco
bolivia|national-teams|Bolivia
senegal|national-teams|Senegal
sweden|national-teams|Sweden
malaysia|national-teams|Malaysia
ecuador|national-teams|Ecuador|Ecuadorian
uzbekistan|national-teams|Uzbekistan
south-korea|national-teams|South Korea|Korea;Korea Republic
usa|national-teams|USA|United States
wales|national-teams|Wales|Welsh
mali|national-teams|Mali
ivory-coast|national-teams|Ivory Coast|Cote d Ivoire;Cote dIvoire;Cote d'Ivoire
saudi-arabia|national-teams|Saudi Arabia
canada|national-teams|Canada
norway|national-teams|Norway
poland|national-teams|Poland
honduras|national-teams|Honduras
turkey|national-teams|Turkey|Turkiye
peru|national-teams|Peru
switzerland|national-teams|Switzerland
south-africa|national-teams|South Africa|South Africa Springbok
dr-congo|national-teams|DR Congo|Congo
burkina-faso|national-teams|Burkina Faso|Burkina
cape-verde|national-teams|Cape Verde
costa-rica|national-teams|Costa Rica
paraguay|national-teams|Paraguay
haiti|national-teams|Haiti
austria|national-teams|Austria
chile|national-teams|Chile|Chlie;Chilen
iraq|national-teams|Iraq
jordan|national-teams|Jordan
uae|national-teams|United Arab Emirates|UAE
yugoslavia|national-teams|Yugoslavia
czech-republic|national-teams|Czech Republic|Czech
georgia|national-teams|Georgia
ukraine|national-teams|Ukraine
finland|national-teams|Finland
hungary|national-teams|Hungary|Magyarorszag
curacao|national-teams|Curaçao|Curacao;Curacaos
qatar|national-teams|Qatar
iran|national-teams|Iran
guinea|national-teams|Guinea
bosnia-and-herzegovina|national-teams|Bosnia and Herzegovina|Bosnia Herzegovina;Bosnia;Bosnia and Herzegovina
serbia|national-teams|Serbia
soviet-union|national-teams|Soviet Union|CCCP;USSR;Soviet Union CCCP
slovakia|national-teams|Slovakia
oman|national-teams|Oman
gambia|national-teams|Gambia
north-macedonia|national-teams|North Macedonia|Northern Macedonia
greece|national-teams|Greece|Hellenic
new-zealand|national-teams|New Zealand
togo|national-teams|Togo
philippines|national-teams|Philippines
benin|national-teams|Benin
iceland|national-teams|Iceland
gabon|national-teams|Gabon
slovenia|national-teams|Slovenia
panama|national-teams|Panama
israel|national-teams|Israel
greenland|national-teams|Greenland
hong-kong|national-teams|Hong Kong|Hongkong
indonesia|national-teams|Indonesia|Timnas Indonesia
bulgaria|national-teams|Bulgaria|Bul-garia
thailand|national-teams|Thailand|Thai
atlanta-hawks|nba|Atlanta Hawks|Hawks
boston-celtics|nba|Boston Celtics|Celtics;Seltics
brooklyn-nets|nba|Brooklyn Nets|Nets
charlotte-hornets|nba|Charlotte Hornets|Hornets
chicago-bulls|nba|Chicago Bulls|Bulls;Bull
cleveland-cavaliers|nba|Cleveland Cavaliers|Cavaliers;Cavs
dallas-mavericks|nba|Dallas Mavericks|Mavericks;Mavs
denver-nuggets|nba|Denver Nuggets|Nuggets
detroit-pistons|nba|Detroit Pistons|Pistons
golden-state-warriors|nba|Golden State Warriors|Warriors;Golden State
houston-rockets|nba|Houston Rockets|Rockets
indiana-pacers|nba|Indiana Pacers|Pacers
los-angeles-clippers|nba|Los Angeles Clippers|Clippers;LA Clippers
los-angeles-lakers|nba|Los Angeles Lakers|Lakers;LA Lakers
memphis-grizzlies|nba|Memphis Grizzlies|Grizzlies
miami-heat|nba|Miami Heat|Heat
milwaukee-bucks|nba|Milwaukee Bucks|Bucks
minnesota-timberwolves|nba|Minnesota Timberwolves|Timberwolves
new-orleans-pelicans|nba|New Orleans Pelicans|Pelicans
new-york-knicks|nba|New York Knicks|Knicks
oklahoma-city-thunder|nba|Oklahoma City Thunder|Thunder
orlando-magic|nba|Orlando Magic|Magic
philadelphia-76ers|nba|Philadelphia 76ers|76ers;Sixers
phoenix-suns|nba|Phoenix Suns|Suns
portland-trail-blazers|nba|Portland Trail Blazers|Blazers;Trail Blazers
sacramento-kings|nba|Sacramento Kings|Kings
san-antonio-spurs|nba|San Antonio Spurs|Spurs
toronto-raptors|nba|Toronto Raptors|Raptors
utah-jazz|nba|Utah Jazz|Jazz
washington-wizards|nba|Washington Wizards|Wizards
seattle-supersonics|nba|Seattle SuperSonics|SuperSonics;Sonics
all-star|nba|NBA All-Star|All Star;All-Star;N-BA All-Star
slam-dunk|basketball-other|Slam Dunk|Slam Dunk;Dunk Master;MN Dunk Master;Slam Dunk Expert
`;

// Supplier sub-categories that name one team (id -> slug). "Other ..." buckets are absent on purpose.
const SUBCATEGORY_TEAMS = {
  479769: 'ac-milan',
  479770: 'inter-milan',
  479772: 'napoli',
  479773: 'atalanta',
  479774: 'fiorentina',
  479775: 'as-roma',
  479776: 'lazio',
  479777: 'parma',
  479778: 'venezia',
  520878: 'cagliari',
  592653: 'hellas-verona',
  479752: 'paris-saint-germain',
  479753: 'olympique-marseille',
  479754: 'lyon',
  479755: 'rennes',
  481618: 'saint-etienne',
  481619: 'nantes',
  533251: 'toulouse',
  479736: 'ajax',
  479737: 'feyenoord',
  479738: 'psv',
  559832: 'az-alkmaar',
  479734: 'boca-juniors',
  479735: 'river-plate',
  520861: 'independiente',
  526540: 'racing-club',
  527157: 'estudiantes',
  535119: 'san-lorenzo',
  548212: 'argentinos-juniors',
  548213: 'huracan',
  548219: 'lanus',
  548225: 'newells-old-boys',
  548229: 'rosario-central',
  548241: 'velez-sarsfield',
  479728: 'benfica',
  479729: 'porto',
  479730: 'sporting-cp',
  481616: 'mali',
  540657: 'vitoria-guimaraes',
  603153: 'estoril',
  520799: 'atletico-nacional',
  520825: 'millonarios',
  520860: 'cerro-porteno',
  572240: 'olimpia',
  527148: 'vissel-kobe',
  531876: 'kashima-antlers',
  531957: 'yokohama-f-marinos',
  540638: 'gamba-osaka',
  543447: 'cerezo-osaka',
  543466: 'kawasaki-frontale',
  547157: 'consadole-sapporo',
  551764: 'tokyo-verdy',
  559124: 'kyoto-sanga',
  571085: 'avispa-fukuoka',
  574103: 'yokohama-f-marinos',
  603152: 'kashiwa-reysol',
  548230: 'beitar-jerusalem',
  479684: 'los-angeles-lakers',
  479698: 'golden-state-warriors',
  479669: 'philadelphia-76ers',
  479670: 'milwaukee-bucks',
  479671: 'all-star',
  479672: 'portland-trail-blazers',
  479673: 'chicago-bulls',
  479674: 'cleveland-cavaliers',
  479675: 'boston-celtics',
  479676: 'los-angeles-clippers',
  479677: 'memphis-grizzlies',
  479678: 'atlanta-hawks',
  479679: 'miami-heat',
  479680: 'charlotte-hornets',
  479681: 'utah-jazz',
  479682: 'sacramento-kings',
  479683: 'new-york-knicks',
  479685: 'orlando-magic',
  479686: 'dallas-mavericks',
  479687: 'brooklyn-nets',
  479688: 'denver-nuggets',
  479689: 'indiana-pacers',
  479690: 'new-orleans-pelicans',
  479691: 'detroit-pistons',
  479692: 'toronto-raptors',
  479693: 'houston-rockets',
  479694: 'san-antonio-spurs',
  479695: 'phoenix-suns',
  479696: 'oklahoma-city-thunder',
  479697: 'minnesota-timberwolves',
  479699: 'washington-wizards',
  479786: 'manchester-united',
  479787: 'chelsea',
  479788: 'tottenham-hotspur',
  479789: 'arsenal',
  479790: 'manchester-city',
  479791: 'leicester-city',
  479792: 'west-ham-united',
  479793: 'wolverhampton-wanderers',
  479794: 'newcastle-united',
  479795: 'everton',
  479796: 'leeds-united',
  481345: 'southampton',
  483358: 'ipswich-town',
  524365: 'aston-villa',
  541552: 'stoke-city',
  559848: 'plymouth-argyle',
  559854: 'nottingham-forest',
  592669: 'sheffield-united',
  479703: 'argentina',
  479701: 'italy',
  479702: 'france',
  479705: 'brazil',
  479704: 'spain',
  479706: 'england',
  479709: 'germany',
  479710: 'mexico',
  479712: 'portugal',
  480847: 'japan',
  479707: 'scotland',
  479711: 'netherlands',
  479713: 'nigeria',
  479714: 'belgium',
  479715: 'croatia',
  479716: 'colombia',
  480967: 'algeria',
  481343: 'palestine',
  484976: 'denmark',
  511651: 'india',
  511769: 'monaco',
  513997: 'uruguay',
  520035: 'egypt',
  520039: 'tunisia',
  527170: 'australia',
  533266: 'jamaica',
  539201: 'el-salvador',
  545825: 'ghana',
  545874: 'venezuela',
  547134: 'cameroon',
  550137: 'albania',
  550163: 'netherlands',
  551748: 'romania',
  552578: 'guatemala',
  557302: 'armenia',
  557305: 'morocco',
  557340: 'bolivia',
  557361: 'senegal',
  559123: 'sweden',
  567233: 'malaysia',
  570053: 'ecuador',
  592654: 'uzbekistan',
  592658: 'south-korea',
  542680: 'penarol',
  591996: 'nacional-uruguay',
  548228: 'emelec',
  553986: 'st-patricks-athletic',
  479780: 'real-madrid',
  480977: 'barcelona',
  479781: 'atletico-madrid',
  479782: 'valencia',
  479783: 'real-betis',
  480935: 'malaga',
  480957: 'mallorca',
  481346: 'sevilla',
  515090: 'athletic-bilbao',
  515095: 'deportivo-la-coruna',
  515097: 'real-valladolid',
  519857: 'granada',
  526543: 'getafe',
  531872: 'racing-santander',
  545298: 'real-zaragoza',
  545310: 'espanyol',
  548240: 'levante',
  550008: 'albacete',
  550159: 'tenerife',
  557303: 'celta-vigo',
  559847: 'cordoba',
  592672: 'hercules',
  479757: 'club-america',
  479758: 'monterrey',
  479759: 'chivas',
  479760: 'cruz-azul',
  479761: 'tijuana',
  520067: 'monterrey',
  520749: 'tigres',
  526528: 'puebla',
  526529: 'necaxa',
  527158: 'mazatlan',
  527171: 'pachuca',
  527172: 'club-leon',
  531855: 'queretaro',
  533381: 'juarez',
  571099: 'pumas-unam',
  479731: 'celtic',
  479732: 'rangers',
  479719: 'al-nassr',
  479720: 'al-hilal',
  479721: 'al-ahli',
  520923: 'universidad-de-chile',
  526538: 'universidad-catolica',
  526549: 'colo-colo',
  526546: 'galatasaray',
  539360: 'fenerbahce',
  527152: 'red-star-belgrade',
  539268: 'olympiacos',
  531877: 'aik',
  580038: 'malmo',
  548223: 'alianza-lima',
  548233: 'sporting-cristal',
  479763: 'bayern-munich',
  479764: 'borussia-dortmund',
  479765: 'vfl-wolfsburg',
  479766: 'eintracht-frankfurt',
  479767: 'rb-leipzig',
  519810: 'borussia-monchengladbach',
  519990: 'hertha-bsc',
  520048: 'bayer-leverkusen',
  527168: 'hamburger-sv',
  535229: 'werder-bremen',
  541551: 'fc-koln',
  543467: 'mainz-05',
  546769: 'schalke-04',
  552577: 'hannover-96',
  559117: 'fortuna-dusseldorf',
  580045: 'hansa-rostock',
  592625: 'holstein-kiel',
  603154: 'arminia-bielefeld',
  479740: 'atletico-mineiro',
  479741: 'corinthians',
  479742: 'cruzeiro',
  479743: 'flamengo',
  479744: 'fluminense',
  479745: 'gremio',
  479746: 'internacional',
  479747: 'palmeiras',
  479748: 'sao-paulo',
  479749: 'santos',
  479750: 'vasco-da-gama',
  527150: 'santa-cruz',
  528282: 'bahia',
  531854: 'criciuma',
  545409: 'paysandu',
  545413: 'botafogo',
  545422: 'vasco-da-gama',
  545821: 'sport-recife',
  548239: 'volta-redonda',
  550162: 'fortaleza',
  554953: 'vitoria',
  559811: 'guarani',
  559825: 'avai',
  582698: 'club-america',
  591998: 'athletico-paranaense',
  479723: 'inter-miami',
  479724: 'la-galaxy',
  479725: 'lafc',
  479726: 'new-york-city-fc',
  520768: 'san-diego-fc',
  520859: 'austin-fc',
  520868: 'charlotte-fc',
  527155: 'new-york-red-bulls',
  527156: 'orlando-city',
  528257: 'vancouver-whitecaps',
  528271: 'new-england-revolution',
  531329: 'cf-montreal',
  531861: 'columbus-crew',
  535227: 'toronto-fc',
  536129: 'nashville-sc',
  540656: 'san-jose-earthquakes',
  543443: 'portland-timbers',
  543445: 'philadelphia-union',
  544830: 'real-salt-lake',
  544831: 'st-louis-city',
  544890: 'minnesota-united',
  547117: 'sporting-kansas-city',
  548243: 'dc-united',
  550172: 'fc-cincinnati',
  550173: 'chicago-fire',
  551754: 'houston-dynamo',
  551755: 'colorado-rapids',
  559902: 'seattle-sounders',
  571933: 'fc-dallas',
};

// Top-level supplier categories: id -> [sport, league|null, kind]. kind: league, generic, info, retro, accessories.
const CATEGORY_HINTS = {
  4717649: ['football', 'serie-a', 'league'],
  4717646: ['football', 'ligue-1', 'league'],
  4717644: ['football', 'eredivisie', 'league'],
  4717642: ['football', 'argentine-primera', 'league'],
  4717640: ['football', 'primeira-liga', 'league'],
  4808061: ['football', 'colombian-primera', 'league'],
  4808305: ['football', 'paraguayan-primera', 'league'],
  4814907: ['football', 'j1-league', 'league'],
  4851219: ['football', 'israeli-premier-league', 'league'],
  4868322: ['football', 'eredivisie', 'league'],
  4717634: ['football', 'national-teams', 'info'],
  4717630: ['basketball', 'nba', 'league'],
  4717654: [null, null, 'info'],
  4717652: ['football', 'premier-league', 'league'],
  4717636: ['football', 'national-teams', 'league'],
  4840889: ['football', 'uruguayan-primera', 'league'],
  4851210: ['football', 'ecuadorian-serie-a', 'league'],
  4861198: ['football', 'league-of-ireland', 'league'],
  4722244: ['football', null, 'generic'],
  4717633: ['other', 'f1', 'league'],
  4717629: ['american-football', 'nfl', 'league'],
  4717627: ['other', 'rugby', 'league'],
  4717624: [null, null, 'baby'],
  4717621: [null, null, 'mixed'],
  0: [null, null, 'generic'],
  4717653: [null, null, 'generic'],
  4717651: ['football', 'la-liga', 'league'],
  4717647: ['football', 'liga-mx', 'league'],
  4717641: ['football', 'scottish-premiership', 'league'],
  4717637: ['football', 'saudi-pro-league', 'league'],
  4808510: ['football', 'chilean-primera', 'league'],
  4813484: ['football', 'super-lig', 'league'],
  4814928: ['football', 'serbian-superliga', 'league'],
  4833468: ['football', 'greek-super-league', 'league'],
  4823320: ['football', 'allsvenskan', 'league'],
  4851195: ['football', 'peruvian-liga-1', 'league'],
  4847144: ['other', 'afl', 'league'],
  4793509: ['football', null, 'generic'],
  4717635: ['football', null, 'generic'],
  4717632: ['other', 'nhl', 'league'],
  4717628: ['other', 'mlb', 'league'],
  4717626: ['football', null, 'generic'],
  4717623: ['football', null, 'generic'],
  4717620: [null, null, 'accessories'],
  5061877: ['football', 'national-teams', 'generic'],
  4717650: ['football', 'national-teams', 'generic'],
  4717648: ['football', 'bundesliga', 'league'],
  4717645: ['football', 'brasileirao', 'league'],
  4717638: ['football', 'mls', 'league'],
  4717625: ['football', 'national-teams', 'generic'],
  4717622: ['football', null, 'retro'],
  4717619: [null, null, 'service'],
  4717655: [null, null, 'info'],
  4963373: [null, null, 'fashion'],
};

// Football players named in titles (informational; they do not change the team).
const PLAYER_TABLE = `
messi|Lionel Messi|Messi;Leo Messi
cristiano-ronaldo|Cristiano Ronaldo|Cristiano Ronaldo;CR7
ronaldo|Ronaldo|Ronaldo
neymar|Neymar|Neymar
maradona|Diego Maradona|Maradona
beckham|David Beckham|Beckham
ibrahimovic|Zlatan Ibrahimović|Ibrahimovic;Zlatan
eusebio|Eusébio|Eusebio
`;

// ---------------------------------------------------------------------------------------------
// Text helpers

/** Lowercase, strip accents, join hyphenated/dotted word parts ("M-anchester" -> "manchester"),
 *  and turn every other non-alphanumeric run into one space. */
export function fold(text) {
  return String(text)
    .replace(/(?<=[a-z])(?=[A-Z][a-z])/g, ' ')
    .replace(/(?<=[A-Za-z])['’]s\b/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/(?<=[a-z0-9])[-.'’`_](?=[a-z0-9])/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
}

function parseTable(text) {
  return text
    .trim()
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim()));
}

export const LEAGUES = Object.fromEntries(
  parseTable(LEAGUE_TABLE).map(([slug, sport, name]) => [slug, { slug, sport, name }]),
);

export const TEAMS = {};
const ALIASES = { football: new Map(), basketball: new Map() };
for (const [rawSlug, league, name, aliases = ''] of parseTable(TEAM_TABLE)) {
  const ambiguous = rawSlug.startsWith('?');
  const slug = rawSlug.replace(/^\?/, '');
  const sport = LEAGUES[league]?.sport;
  if (!sport) throw new Error(`team ${slug}: unknown league ${league}`);
  TEAMS[slug] = { slug, league, name, sport, ...(ambiguous ? { ambiguous: true } : {}) };
  const map = ALIASES[sport];
  if (!map) continue;
  const names = [name, ...aliases.split(';')].map((a) => a.trim()).filter(Boolean);
  for (const alias of names) {
    for (const variant of new Set([fold(alias), fold(alias.replace(/[-.]/g, ' '))])) {
      if (!variant) continue;
      // The same name can belong to several teams ("Tigre"); the category's league decides, else the first listed.
      const list = map.get(variant) ?? [];
      if (!list.includes(slug)) list[alias === name ? 'unshift' : 'push'](slug); // a team's own name comes first
      map.set(variant, list);
    }
  }
}
// National teams also play basketball (catalog/classification.json uses the same slug for both).
for (const alias of ['usa', 'team usa', 'usa team', 'dream team', 'united states'])
  ALIASES.basketball.set(alias, ['usa']);

const PLAYERS = new Map();
for (const [slug, , aliases] of parseTable(PLAYER_TABLE)) {
  for (const a of aliases.split(';')) PLAYERS.set(fold(a), slug);
}

// Canonical names from catalog/classification.json win over the TEAMS table (same slug).
export function applyClassification(classification) {
  if (!classification?.teams) return;
  for (const [slug, t] of Object.entries(classification.teams)) {
    if (TEAMS[slug]) TEAMS[slug].name = t.en ?? TEAMS[slug].name;
  }
}

// ---------------------------------------------------------------------------------------------
// Seasons

const pivot = (yy) => (yy <= 30 ? 2000 + yy : 1900 + yy);

/** Finds the season in a raw title: "26-27", "2025/26", "1995-97", "2026", "06/07". Returns
 *  { season: "2026-27" | "2026", start, text } or null. */
export function parseSeason(raw) {
  const t = String(raw).replace(/[　]/g, ' ');
  const valid = (a, b) => {
    const span = (b - a + 100) % 100;
    return span >= 1 && span <= 3;
  };
  let m = t.match(/(?<![\d#])((?:19|20)\d{2})\s*[-/_]\s*((?:19|20)\d{2})(?![\d])/);
  if (m && Number(m[2]) - Number(m[1]) >= 1 && Number(m[2]) - Number(m[1]) <= 3) {
    return { season: `${m[1]}-${m[2].slice(2)}`, start: Number(m[1]), text: m[0] };
  }
  m = t.match(/(?<![\d#])((?:19|20)\d{2})\s*[-/_]\s*(\d{2})(?![\d])/);
  if (m && valid(Number(m[1]) % 100, Number(m[2]))) {
    return { season: `${m[1]}-${m[2]}`, start: Number(m[1]), text: m[0] };
  }
  m = t.match(/(?<![\d#-])(\d{2})\s*[-/]\s*(\d{2})(?![\d#]|\s*(?:#|xl\b))/i);
  if (m && valid(Number(m[1]), Number(m[2]))) {
    const start = pivot(Number(m[1]));
    return { season: `${start}-${m[2]}`, start, text: m[0] };
  }
  m = t.match(/(?<![\d#])((?:19[0-9]|20[0-2])\d)(?![\d])/);
  if (m) return { season: m[1], start: Number(m[1]), text: m[0] };
  return null;
}

// Sizes in titles: "S-XXL", "S-4XL", "XS-XXL", "M-3XL", "16-28", "size: 16-28", "16#-2XL".
const SIZE_RE =
  /\b(?:size\s*:?\s*)?(?:(?:x{0,3}s|s|m|l|\d{2}#?)\s*-\s*(?:\d?x{1,4}l|\dxl|xxxl|x{1,3}|\d?x{0,3}l)|16\s*-\s*28)\b/gi;

export function parseSizes(raw) {
  const found = [...String(raw).matchAll(SIZE_RE)].map((m) => m[0].replace(/^size\s*:?\s*/i, '').replace(/\s+/g, ''));
  return found.length ? found : null;
}

// ---------------------------------------------------------------------------------------------
// Descriptor vocabulary (applied to folded text)

const RX = {
  goalkeeper: /\b(goal ?keepers?|goalkeper|groakeeper|goalie|gk)\b/,
  training: /\b(training|traning|trainning|trianing|ttraining|trainng|pre ?match|pre ?race|pre ?game|warm ?up)\b/,
  fourth: /\b(fourth|fouth|4th)\b/,
  third: /\b(third|3rd)\b/,
  away: /\b(away|second)\b/,
  home: /\b(home|hone)\b/,
  special:
    /\b(special|specia|speical|specila|especial|edition|commemorative|anniversary|snniversary|limited|concept|concpet|souvenir|souvennir|theme|themed|champions?|championship|memorial|tribute|joint|jointly|centennial|final|dragon|cartoon|anime|crayon|fashion|style|leaked|graffiti|reflective|double sided|double faced|reversible|valentine|oktoberfest|ninja|y3|christmas|legacy|heritage|icon|\d?stars?|\d+(?:st|nd|rd|th))\b/,
  kids: /\b(kids?|children|childrens|child|youth|boys?)\b/,
  baby: /\b(baby|babies|infants?|toddlers?|newborn)\b/,
  women: /\b(women|woman|womens|wowan|ladies|lady|female|girls?)\b/,
  both: /\b(adults? (?:and )?kids?|adult and kids|both)\b/,
  player: /\bplayers?\b/,
  fan: /\bfans?\b/,
  long: /\b(long ?sleeves?|long ?sleeved|ls)\b/,
  retro: /\b(retro|vintage|throwback|classics?|hardwood)\b/,
  windbreaker: /\b(windbreakers?|windbreak|windbreake|wincbreak|wind breaker)\b/,
  jacket: /\b(jackets?|jakcets?|coats?|padded|parka|anthem|outdoor)\b/,
  tracksuit: /\b(tracksuits?|track suits?|jogging)\b/,
  hoodie: /\b(hoodies?|hoody|hooded|sweatshirts?|swearshirts?|sweaters?)\b/,
  polo: /\b(polos?|poio|po io)\b/,
  tshirt: /\b(tshirts?|t shirts?|tees?)\b/,
  vest: /\b(vests?|singlets?|sleeveless|tank tops?)\b/,
  socks: /\bsocks?\b/,
  pants: /\b(pants|trousers)\b/,
  suit: /\b(suits?|sets?)\b/,
  shorts: /\bshorts\b/,
  withShorts: /\b(jerseys? (?:and |with )?shorts|shirts? and shorts|and shorts|with shorts)\b/,
  kit: /\bkits?\b/,
  accessory:
    /\b(balls?|gloves?|leggings?|shin ?guards?|leg shield|hats?|caps?|scarf|scarves|beanies?|bags?|backpacks?|patch|patches|armband|keychains?|bottles?|flags?|volleyball|board|equipment|masks?)\b/,
  baseball: /\bbaseball\b/,
  // basketball
  city: /\b(city(?: edition| version)?|urban edition|minneapolis edition)\b/,
  association: /\bassociation\b/,
  statement: /\b(statement|jordan themed)\b/,
  earned: /\bearned\b/,
  anniversary75: /\b75th\b/,
  embroidered: /\b(embroidery|embroidered|stitched|density)\b/,
  heatPressed: /\b(hot ?press(?:ing)?|printed)\b/,
  roundNeck: /\b(round neck|short sleeves?)\b/,
  brand: /\b(adidas|addias|ad|nike|nk|puma|hummel|north face|t90|p90|umbro|kappa)\b/,
  baseballTeams:
    /\b(rays|braves|metropolitan|mets|angels|cubs|islanders?|padres|rocky|rockies|royals|blue jays?|dodgers|yankees|astros|mariners|brewers|twins|guardians|orioles|phillies|marlins|nationals|diamondbacks)\b/,
};

const BRANDS = { ad: 'adidas', addias: 'adidas', nk: 'nike', t90: 'nike', p90: 'nike', 'north face': 'the-north-face' };

const COLOR_WORDS = {
  black: 'black',
  balck: 'black',
  white: 'white',
  blue: 'blue',
  navy: 'blue',
  red: 'red',
  burgundy: 'red',
  maroon: 'red',
  wine: 'red',
  green: 'green',
  olive: 'green',
  teal: 'green',
  yellow: 'yellow',
  gold: 'yellow',
  golden: 'yellow',
  royal: 'blue',
  purple: 'purple',
  violet: 'purple',
  pink: 'pink',
  grey: 'grey',
  gray: 'grey',
  silver: 'grey',
  orange: 'orange',
  cream: 'cream',
  beige: 'cream',
  brown: 'brown',
  cyan: 'blue',
  sky: 'blue',
};

// Words that carry no product information once the rest is parsed.
const NOISE = new Set(
  (
    'yupoo cheap soccer football futbol jersey jerseys jersery jersrey jeresy jersye jerse ys shirt shirts kit kits and with ' +
    'version versoin veresion versin verison verion vesion versio edition the of for new season size mens men man adult adults ' +
    'aldult nba nfl club fc cf sc ac cd sv team uniform unifor sccer socce chea heap yup oo yupo yupoo0000000000000000000000000 ' +
    'out stock bonus mvp award gold round neck nike adidas addias puma jordan air x vs world cup full half zip zipper cotton ' +
    'leisure sportswear slim fit game match authentic replica fans fan player players pocket ball wear s both vneck v neck connect recognition'
  ).split(' '),
);

// ---------------------------------------------------------------------------------------------
// Team lookup

function findTeam(tokens, sport, leagueHint = null) {
  // Every alias found in the title competes: the longest wins; on a tie a club beats a national team
  // ("Brazil Internacional" is the club), then the leftmost; with the sport unknown, football first.
  const hits = [];
  for (const sp of sport ? [sport] : ['football', 'basketball']) {
    const map = ALIASES[sp];
    if (!map) continue;
    for (let n = Math.min(6, tokens.length); n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const slugs = map.get(tokens.slice(i, i + n).join(' '));
        if (!slugs) continue;
        const slug = slugs.find((x) => TEAMS[x].league === leagueHint) ?? slugs[0];
        hits.push({ slug, n, i, sport: sp });
      }
    }
  }
  if (!hits.length) return null;
  const national = (h) => (TEAMS[h.slug].league === 'national-teams' ? 1 : 0);
  hits.sort((a, b) => b.n - a.n || national(a) - national(b) || a.i - b.i);
  return hits[0];
}

// ---------------------------------------------------------------------------------------------
// Title -> attributes

const INFO_TITLE =
  /^(question|about shipping|how to order|.*sizes? chart|about liuyang|service center|customize jerseys?|size$)/i;

/**
 * Parses one album title. hints: { sport, league, team, kind } from the supplier category (optional).
 * Returns the normalized attributes, plus `problems` (why it is unparsed) and `unknown_words`.
 */
export function normalizeTitle(title, hints = {}) {
  const raw = String(title).replace(/\s+/g, ' ').trim();
  const out = {};
  const problems = [];

  if (INFO_TITLE.test(raw) || hints.kind === 'info' || hints.kind === 'service') {
    return { skip: hints.kind === 'service' ? 'service' : 'info' };
  }

  // Sport: category first, then title words.
  const f0 = fold(raw);
  let sport = hints.sport ?? null;
  let league = hints.league ?? null;
  if (!sport) {
    if (/\b(nba|basketball)\b/.test(f0) || /\b(embroidery|hot press|pocket shorts|ball pants)\b/.test(f0))
      sport = 'basketball';
    else if (/\b(nfl|super bowl|salute to service|pro bowl)\b/.test(f0)) [sport, league] = ['american-football', 'nfl'];
    else if (/\b(nhl|hockey|ice hockey)\b/.test(f0)) [sport, league] = ['other', 'nhl'];
    else if (/\b(mlb)\b/.test(f0)) [sport, league] = ['other', 'mlb'];
    else if (
      /\b(f1|formula one|formula 1|mclaren|ferrari|ferrarri|redbull|red bull f1|mercedes|alpine|williams|ducati|nissan|aston martin|renault)\b/.test(
        f0,
      )
    )
      [sport, league] = ['other', 'f1'];
    else if (/\brugby\b/.test(f0)) [sport, league] = ['other', 'rugby'];
    else if (/\b(afl|richmond)\b/.test(f0)) [sport, league] = ['other', 'afl'];
    else if (/\b(baseball|lotte marines)\b/.test(f0) && !findTeam(f0.split(' '), 'football'))
      [sport, league] = ['other', 'mlb'];
    else if (/\b(soccer|football)\b/.test(f0)) sport = 'football';
  }
  if (/\blotte marines\b/.test(f0)) [sport, league] = ['other', 'mlb']; // Japanese baseball, filed under football
  // "Other ball suits" mixes NHL teams (obfuscated names) with two NBA albums.
  if (!sport && hints.kind === 'mixed') {
    sport = /\b(nba|lakers)\b/.test(f0) ? 'basketball' : 'other';
    if (sport === 'other') league = 'nhl';
  }

  // Season and sizes come out of the raw title before folding (hyphens matter there).
  let rest = raw;
  const sizes = parseSizes(rest);
  rest = rest.replace(SIZE_RE, ' ');
  const season = parseSeason(rest);
  if (season) rest = rest.replace(season.text, ' ');
  // A second season-like token (e.g. "2026 2026 Bosnia") is noise.
  const again = parseSeason(rest);
  if (again && again.season === season?.season) rest = rest.replace(again.text, ' ');

  // Basketball player/number: "DONCIC#77", "Curry #30", "23#James", "#30".
  let number = null;
  let playerRaw = null;
  const numMatch =
    rest.match(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z.']*(?:\s+(?:II|III|[Jj][Rr]\.?))?)\s*#\s*(\d{1,2})(?!\d)/) ??
    rest.match(/(?<![\w#])(\d{1,2})\s*#\s*([A-Za-z][A-Za-z.']+)/) ??
    rest.match(/#\s*(\d{1,2})(?!\d)/);
  if (numMatch) {
    if (numMatch.length === 3 && /^\d/.test(numMatch[1])) [number, playerRaw] = [numMatch[1], numMatch[2]];
    else if (numMatch.length === 3) [playerRaw, number] = [numMatch[1], numMatch[2]];
    else number = numMatch[1];
    rest = rest.replace(numMatch[0], ` ${playerRaw ?? ''} `);
  }

  let f = fold(rest);
  // Retro titles sometimes carry a bare two-digit year: "A-rsenal 94", "Japan 98".
  let seasonInfo = season;
  if (!seasonInfo && sport !== 'basketball' && (hints.kind === 'retro' || RX.retro.test(f))) {
    const m = f.match(/(?:^|\s)(\d{2})(?=\s|$)/);
    if (m) {
      const start = pivot(Number(m[1]));
      seasonInfo = { season: String(start), start, text: m[1] };
      f = f.replace(new RegExp(`(^|\\s)${m[1]}(?=\\s|$)`), ' ').trim();
    }
  }

  let tokens = f.split(' ').filter(Boolean);
  // Team: longest alias among the album's sport (both football and basketball when unknown).
  const teamSport = sport === 'football' || sport === 'basketball' ? sport : sport ? null : undefined;
  let teamHit = teamSport === null ? null : findTeam(tokens, teamSport, league);
  if (teamHit && !sport) sport = teamHit.sport;
  if (!sport && !teamHit && RX.baseballTeams.test(f)) [sport, league] = ['other', 'mlb'];
  let team = teamHit?.slug ?? null;
  if (teamHit) tokens.splice(teamHit.i, teamHit.n);
  if (hints.team && (!team || TEAMS[team]?.ambiguous)) {
    team = hints.team;
    if (!sport) sport = TEAMS[team]?.sport ?? null;
  } else if (hints.team && team && team !== hints.team) {
    out.category_team = hints.team; // title and category disagree; the title wins
  }
  if (team && TEAMS[team]) {
    league = TEAMS[team].league;
    if (TEAMS[team].ambiguous) problems.push(`ambiguous team name "${TEAMS[team].name}"`);
  }

  const text = tokens.join(' ');
  const has = (k) => RX[k].test(text);

  // Football players named in titles (Messi, Ronaldo...)
  let footballPlayer = null;
  for (let n = 2; n >= 1 && !footballPlayer; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const p = PLAYERS.get(tokens.slice(i, i + n).join(' '));
      if (p) {
        footballPlayer = p;
        tokens.splice(i, n);
        break;
      }
    }
  }

  // Product type
  let type = 'jersey';
  let item = null;
  const longSleeve = has('long');
  // "Ball" is also a basketball player (LaMelo Ball #1), so basketball titles need more than that word.
  const accessory =
    has('accessory') &&
    !(
      sport === 'basketball' &&
      (has('pants') || !/\b(basketball|socks?|bags?|caps?|hats?)\b/.test(text.replace(/\bball\b/g, '')))
    );
  if (hints.kind === 'accessories' || accessory) {
    [type, item] = ['other', has('socks') ? 'socks' : 'accessory'];
  } else if (has('socks')) [type, item] = ['other', 'socks'];
  else if (has('windbreaker')) [type, item] = ['jacket', 'windbreaker'];
  else if (has('jacket')) type = 'jacket';
  else if (has('tracksuit') || (has('suit') && longSleeve)) type = 'tracksuit';
  else if (has('hoodie')) type = 'hoodie';
  else if (has('polo')) type = 'polo';
  else if (has('vest') && sport !== 'basketball') [type, item] = ['other', 'vest'];
  else if (has('tshirt')) [type, item] = ['other', 't-shirt'];
  else if (has('suit') && sport === 'basketball')
    out.with_shorts = true; // a basketball "suit" is jersey + shorts
  else if (has('suit') && (has('training') || !(has('kids') || has('baby')))) [type, item] = ['other', 'training-set'];
  else if (has('pants')) type = sport === 'basketball' ? 'shorts' : 'other';
  else if (has('shorts') && !has('withShorts')) type = 'shorts';
  else if (has('baseball') && sport === 'football') [type, item] = ['other', 'baseball-jersey'];
  if (type === 'other' && !item && has('pants')) item = 'pants';
  if (hints.kind === 'fashion') [type, item] = ['other', 'fashion'];

  // Audience
  let audience = 'adult';
  if (has('both')) audience = 'adult+kids';
  else if (has('baby')) audience = 'kids';
  else if (has('kids')) audience = 'kids';
  else if (has('women')) audience = 'women';
  const baby = has('baby') || hints.kind === 'baby';
  if (baby) audience = 'kids';
  if (type === 'jersey' && audience === 'kids' && (has('withShorts') || has('kit') || has('suit'))) type = 'kids-kit';
  if (type === 'jersey' && audience !== 'kids' && has('withShorts')) out.with_shorts = true;

  // Kit (football-style kits; basketball keeps its edition separately)
  let kit = null;
  if (has('goalkeeper')) kit = 'goalkeeper';
  else if (has('training')) kit = 'training';
  else if (has('fourth')) kit = 'fourth';
  else if (has('third')) kit = 'third';
  else if (sport !== 'basketball' && has('special')) kit = 'special';
  else if (has('away')) kit = 'away';
  else if (has('home')) kit = 'home';
  if (!kit && sport !== 'basketball' && hints.kind !== 'retro' && /\b(oasis|iron maiden)\b/.test(f)) kit = 'special';

  const version = has('player') ? 'player' : 'fan';
  const sleeve = longSleeve
    ? 'long'
    : has('vest') && sport !== 'basketball'
      ? 'none'
      : sport === 'basketball' && !has('roundNeck')
        ? null
        : 'short';

  // Retro: labelled retro, the Retro category, or a season before 2016 (as catalog/classification.json)
  const retroWord = has('retro');
  const retro = retroWord || hints.kind === 'retro' || (seasonInfo && seasonInfo.start < 2016);

  // Basketball extras
  let edition = null;
  let print = null;
  let colors = null;
  if (sport === 'basketball') {
    if (has('city')) edition = 'city';
    else if (has('association')) edition = 'association';
    else if (has('statement')) edition = 'statement';
    else if (/\bicon\b/.test(text)) edition = 'icon';
    else if (has('earned')) edition = 'earned';
    else if (retroWord) edition = 'classic';
    else if (has('anniversary75')) edition = '75th-anniversary';
    else if (
      /\b(special|anniversary|commemorative|christmas|latin night|award|bonus|mvp|gold edition|all star)\b/.test(text)
    )
      edition = 'special';
    if (has('embroidered')) print = 'embroidered';
    else if (has('heatPressed')) print = 'heat-pressed';
  }
  const colorSet = new Set();
  for (const tok of fold(raw).split(' ')) if (COLOR_WORDS[tok]) colorSet.add(COLOR_WORDS[tok]);
  if (colorSet.size) colors = [...colorSet];

  // Player name for basketball (last name, lowercased); football players from the list above.
  let player = footballPlayer;
  if (playerRaw && sport === 'basketball') {
    const p = fold(playerRaw)
      .split(' ')
      .filter((w) => !['ii', 'iii', 'jr'].includes(w))
      .pop();
    const teamWord =
      p && (ALIASES.basketball.has(p) || /^\d+$/.test(p) || ['nba', 'jersey', 'new', 'season', 'edition'].includes(p));
    if (p && !teamWord) player = PLAYER_TYPOS[p] ?? p;
  }

  // Words we did not recognize (helps extend the vocabulary).
  const known = new Set();
  for (const k of Object.keys(RX))
    for (const m of text.matchAll(new RegExp(RX[k].source, 'g'))) m[0].split(' ').forEach((w) => known.add(w));
  const unknown = tokens.filter(
    (w) => !known.has(w) && !NOISE.has(w) && !COLOR_WORDS[w] && !/^\d+$/.test(w) && w !== fold(playerRaw ?? '-'),
  );

  // Brand teamwear without a club ("Adidas Training Suit", "Nike T90 jersey") is understood, not unparsed.
  const brand = f0.match(RX.brand)?.[1] ?? null;
  const teamType = ['jersey', 'kids-kit', 'shorts'].includes(type);
  if (!sport && teamType && !brand && hints.kind !== 'fashion') problems.push('sport');
  if ((sport === 'football' || sport === 'basketball') && teamType && !team && !footballPlayer && !brand)
    problems.push('team');
  if (!team && brand) out.brand = BRANDS[brand] ?? brand;

  Object.assign(out, {
    sport: sport ?? null,
    league: league ?? null,
    team,
    season: seasonInfo?.season ?? null,
    kit,
    audience,
    ...(baby ? { baby: true } : {}),
    version,
    sleeve,
    type,
    ...(item ? { item } : {}),
    ...(retro ? { retro: seasonInfo?.season ?? true } : {}),
    ...(player ? { player } : {}),
    ...(number !== null && sport === 'basketball' ? { number: Number(number) } : {}),
    ...(edition ? { edition } : {}),
    ...(print ? { print } : {}),
    ...(colors ? { colors } : {}),
    ...(sizes ? { sizes } : {}),
  });
  if (problems.length) out.problems = problems;
  if (unknown.length) out.unknown_words = unknown;
  return out;
}

const PLAYER_TYPOS = {
  jdrdan: 'jordan',
  hompson: 'thompson',
  wesbrook: 'westbrook',
  haywaro: 'hayward',
  dinwddie: 'dinwiddie',
  ricciado: 'ricciardo',
};

// ---------------------------------------------------------------------------------------------
// Album -> entry

/** Picks the category hints for an album from its category ids (sub-categories first). */
export function categoryHints(categoryIds, categoriesById) {
  const cats = categoryIds.map((id) => categoriesById[id]).filter(Boolean);
  const subs = cats.filter((c) => c.parent_id);
  const tops = cats.filter((c) => !c.parent_id);
  let hint = { sport: null, league: null, team: null, kind: 'generic' };
  const ordered = [...subs.map((s) => categoriesById[s.parent_id]), ...tops].filter(Boolean);
  for (const top of ordered) {
    const h = CATEGORY_HINTS[top.id];
    if (!h) continue;
    const [sport, league, kind] = h;
    if (kind === 'info' || kind === 'service' || kind === 'fashion' || kind === 'accessories' || kind === 'baby') {
      hint = { sport: sport ?? hint.sport, league: league ?? hint.league, team: null, kind };
      if (kind === 'info' || kind === 'service') break;
      continue;
    }
    if (!hint.sport && sport) hint.sport = sport;
    if (!hint.league && league && kind === 'league') hint.league = league;
    if (kind === 'retro' || kind === 'mixed') hint.kind = kind;
    else if (hint.kind === 'generic' && kind === 'league') hint.kind = 'league';
  }
  for (const s of subs) {
    const slug = SUBCATEGORY_TEAMS[s.id];
    if (slug) {
      hint.team = slug;
      break;
    }
  }
  return hint;
}

export function normalizeAlbum(album, categoriesById, base) {
  const hints = categoryHints(album.categories, categoriesById);
  const attrs = normalizeTitle(album.title, hints);
  const entry = {
    id: album.id,
    title: album.title,
    url: `${base}/albums/${album.id}?uid=1`,
    cover: album.cover,
    photos: album.photos || null,
    cats: album.categories,
  };
  if (attrs.skip) return { ...entry, skip: attrs.skip };
  return { ...entry, ...attrs };
}

// Values left out of albums.json entries (a missing field means the default, or unknown for the rest).
export const DEFAULTS = { audience: 'adult', version: 'fan', sleeve: 'short', type: 'jersey' };

/** The compact form written to albums.json: no URL (see album_url), cover relative to cover_base,
 *  category ids as numbers, and no default or empty values. */
export function compact(entry, coverBase) {
  const out = {};
  for (const [k, v] of Object.entries(entry)) {
    if (v === null || v === undefined || k === 'url' || k === 'unknown_words') continue;
    if (DEFAULTS[k] === v) continue;
    if (k === 'cover') out.cover = v.startsWith(coverBase) ? v.slice(coverBase.length) : v;
    else if (k === 'cats') out.cats = v.map(Number);
    else out[k] = v;
  }
  return out;
}

/** Expands a compact albums.json entry back to the full form (defaults, URL and cover URL). */
export function expand(entry, header) {
  return {
    ...DEFAULTS,
    ...entry,
    url: header.album_url.replace('{id}', entry.id),
    cover: entry.cover && !/^https?:/.test(entry.cover) ? header.cover_base + entry.cover : (entry.cover ?? null),
  };
}

// ---------------------------------------------------------------------------------------------
// CLI

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const store = opt('store', 'jerseyxie');
  const input = path.resolve(repoRoot, opt('in', `qa-output/${store}-cache/crawl.json`));
  const output = path.resolve(repoRoot, opt('out', `catalog/sources/${store}/albums.json`));
  const classificationFile = path.resolve(repoRoot, opt('classification', 'catalog/classification.json'));
  if (existsSync(classificationFile)) applyClassification(JSON.parse(readFileSync(classificationFile, 'utf8')));
  else console.error(`note: ${path.relative(repoRoot, classificationFile)} not found; using the built-in team names`);

  const crawl = JSON.parse(readFileSync(input, 'utf8'));
  const categoriesById = Object.fromEntries(crawl.categories.map((c) => [c.id, c]));
  const entries = crawl.albums.map((a) => normalizeAlbum(a, categoriesById, crawl.source));
  const albums = entries.filter((e) => !e.skip);
  const skipped = entries.filter((e) => e.skip).map((e) => ({ id: e.id, title: e.title, reason: e.skip }));
  const unparsed = albums.filter((a) => a.problems);

  const count = (key) =>
    Object.fromEntries(
      Object.entries(
        albums.reduce((acc, a) => {
          const k = String(a[key] ?? 'unknown');
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1]),
    );
  const unknownWords = {};
  for (const a of albums) for (const w of a.unknown_words ?? []) unknownWords[w] = (unknownWords[w] ?? 0) + 1;

  const coverBase = `https://photo.yupoo.com/${store}/`;
  const header = {
    source: crawl.source,
    crawled_at: crawl.crawled_at,
    normalized_at: new Date().toISOString(),
    note: 'One entry per product album. Field meanings: catalog/sources/jerseyxie/README.md. Built by scripts/catalog/yupoo-normalize.mjs from the crawl of scripts/catalog/yupoo-crawl.mjs.',
    album_url: `${crawl.source}/albums/{id}?uid=1`,
    cover_base: coverBase,
    defaults: DEFAULTS,
    totals: {
      albums_seen: crawl.albums.length,
      product_albums: albums.length,
      skipped: skipped.length,
      unparsed: unparsed.length,
      by_sport: count('sport'),
      by_type: count('type'),
      top_seasons: Object.entries(
        albums.reduce((acc, a) => {
          acc[a.season ?? 'unknown'] = (acc[a.season ?? 'unknown'] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([season, n]) => ({ season, albums: n })),
    },
    teams: Object.fromEntries(
      [...new Set(albums.map((a) => a.team).filter(Boolean))]
        .sort()
        .map((slug) => [slug, { name: TEAMS[slug]?.name ?? slug, league: TEAMS[slug]?.league ?? null }]),
    ),
    leagues: LEAGUES,
    categories: Object.fromEntries(
      crawl.categories.map((c) => [c.id, { name: c.name, parent: c.parent_id ?? null, albums: c.albums_seen ?? null }]),
    ),
    skipped,
    unknown_words: Object.fromEntries(
      Object.entries(unknownWords)
        .sort((a, b) => b[1] - a[1])
        .filter(([, n]) => n >= 3),
    ),
  };
  mkdirSync(path.dirname(output), { recursive: true });
  const lines = albums.map((a) => JSON.stringify(compact(a, coverBase)));
  const headerJson = JSON.stringify(header, null, 1).replace(/\n\}$/, '');
  writeFileSync(output, `${headerJson},\n "albums": [\n${lines.join(',\n')}\n ]\n}\n`);

  console.log(
    `${albums.length} product albums (${skipped.length} info albums skipped) -> ${path.relative(repoRoot, output)}`,
  );
  console.log(`by sport: ${JSON.stringify(header.totals.by_sport)}`);
  console.log(`by type: ${JSON.stringify(header.totals.by_type)}`);
  console.log(`unparsed: ${unparsed.length}`);
  for (const a of unparsed) console.log(`  ${a.id}  ${a.title}  [${a.problems.join(', ')}]`);
}
