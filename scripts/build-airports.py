#!/usr/bin/env python3
"""
Gera src/data/airports.json a partir do airports.csv do OurAirports
(https://ourairports.com/data/, domínio público).

    curl -sSLo /tmp/airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
    python3 scripts/build-airports.py /tmp/airports.csv

Fica só o que tem código IATA e voo comercial regular (~3.200 aeroportos).
O OurAirports traz a cidade em inglês ou no nome do município ("Ferno (VA)"
para Malpensa), então as cidades que importam ganham nome em português e
apelidos de busca aqui embaixo.
"""

import csv
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "airports.json"
# Coordenadas ficam num arquivo à parte: só o mapa (no servidor) usa, e a
# busca no navegador não precisa baixar esses bytes.
COORDS = OUT.with_name("airport-coords.json")

# IATA → cidade em português. Inclui os aeroportos secundários das mesmas
# cidades, para "Milão" achar MXP, LIN e BGY.
PT_CITY = {
    # Brasil (o OurAirports já traz certo; aqui só os que vêm diferentes)
    "GRU": "São Paulo", "CGH": "São Paulo", "VCP": "Campinas", "GIG": "Rio de Janeiro", "SDU": "Rio de Janeiro",
    "BSB": "Brasília", "CNF": "Belo Horizonte", "PLU": "Belo Horizonte", "SSA": "Salvador", "POA": "Porto Alegre",
    "FLN": "Florianópolis", "CWB": "Curitiba", "REC": "Recife", "FOR": "Fortaleza", "NAT": "Natal", "BEL": "Belém",
    "MAO": "Manaus", "VIX": "Vitória", "GYN": "Goiânia", "MCZ": "Maceió", "JPA": "João Pessoa", "AJU": "Aracaju",
    "SLZ": "São Luís", "THE": "Teresina", "CGB": "Cuiabá", "CGR": "Campo Grande", "IGU": "Foz do Iguaçu",
    "NVT": "Navegantes", "BPS": "Porto Seguro", "IOS": "Ilhéus", "FEN": "Fernando de Noronha", "JJD": "Jericoacoara",
    # Portugal e Espanha
    "LIS": "Lisboa", "OPO": "Porto", "FAO": "Faro", "FNC": "Funchal", "PDL": "Ponta Delgada",
    "MAD": "Madri", "BCN": "Barcelona", "AGP": "Málaga", "SVQ": "Sevilha", "VLC": "Valência", "PMI": "Palma de Maiorca",
    "BIO": "Bilbau", "IBZ": "Ibiza", "TFS": "Tenerife", "TFN": "Tenerife", "LPA": "Gran Canaria",
    # França, Benelux, Suíça
    "CDG": "Paris", "ORY": "Paris", "BVA": "Paris", "NCE": "Nice", "LYS": "Lyon", "MRS": "Marselha", "TLS": "Toulouse",
    "BOD": "Bordeaux", "NTE": "Nantes", "AMS": "Amsterdã", "EIN": "Eindhoven", "BRU": "Bruxelas", "CRL": "Bruxelas",
    "LUX": "Luxemburgo", "ZRH": "Zurique", "GVA": "Genebra", "BSL": "Basileia",
    # Reino Unido e Irlanda
    "LHR": "Londres", "LGW": "Londres", "STN": "Londres", "LTN": "Londres", "LCY": "Londres", "SEN": "Londres",
    "MAN": "Manchester", "EDI": "Edimburgo", "GLA": "Glasgow", "BHX": "Birmingham", "DUB": "Dublin",
    # Itália
    "FCO": "Roma", "CIA": "Roma", "MXP": "Milão", "LIN": "Milão", "BGY": "Milão", "VCE": "Veneza", "TSF": "Veneza",
    "FLR": "Florença", "PSA": "Pisa", "NAP": "Nápoles", "BLQ": "Bolonha", "TRN": "Turim", "CTA": "Catânia",
    "PMO": "Palermo", "BRI": "Bari", "OLB": "Olbia", "CAG": "Cagliari", "VRN": "Verona", "GOA": "Gênova",
    # Alemanha, Áustria, Europa Central
    "FRA": "Frankfurt", "MUC": "Munique", "BER": "Berlim", "HAM": "Hamburgo", "DUS": "Düsseldorf", "CGN": "Colônia",
    "STR": "Stuttgart", "VIE": "Viena", "SZG": "Salzburgo", "PRG": "Praga", "BUD": "Budapeste", "WAW": "Varsóvia",
    "KRK": "Cracóvia",
    # Nórdicos e Leste
    "CPH": "Copenhague", "ARN": "Estocolmo", "OSL": "Oslo", "HEL": "Helsinque", "KEF": "Reykjavík",
    "ATH": "Atenas", "JTR": "Santorini", "JMK": "Míconos", "HER": "Heraklion", "SKG": "Tessalônica",
    "IST": "Istambul", "SAW": "Istambul", "SVO": "Moscou", "DME": "Moscou", "VKO": "Moscou", "OTP": "Bucareste",
    "SOF": "Sófia", "DBV": "Dubrovnik", "SPU": "Split", "ZAG": "Zagreb", "LJU": "Liubliana", "TIA": "Tirana",
    # Oriente Médio e África
    "DXB": "Dubai", "DWC": "Dubai", "AUH": "Abu Dhabi", "DOH": "Doha", "TLV": "Tel Aviv", "AMM": "Amã",
    "CAI": "Cairo", "RAK": "Marrakech", "CMN": "Casablanca", "JNB": "Joanesburgo", "CPT": "Cidade do Cabo",
    "LAD": "Luanda", "ADD": "Adis Abeba", "NBO": "Nairóbi", "MRU": "Maurício",
    # Ásia e Oceania
    "NRT": "Tóquio", "HND": "Tóquio", "KIX": "Osaka", "ICN": "Seul", "PEK": "Pequim", "PKX": "Pequim",
    "PVG": "Xangai", "SHA": "Xangai", "HKG": "Hong Kong", "TPE": "Taipé", "SIN": "Singapura", "BKK": "Bangcoc",
    "DMK": "Bangcoc", "HKT": "Phuket", "KUL": "Kuala Lumpur", "CGK": "Jacarta", "DPS": "Bali", "MNL": "Manila",
    "DEL": "Nova Délhi", "BOM": "Mumbai", "MLE": "Malé (Maldivas)", "SYD": "Sydney", "MEL": "Melbourne",
    "AKL": "Auckland",
    # América do Norte e Caribe
    "JFK": "Nova York", "EWR": "Nova York", "LGA": "Nova York", "MIA": "Miami", "FLL": "Fort Lauderdale",
    "MCO": "Orlando", "LAX": "Los Angeles", "SFO": "São Francisco", "LAS": "Las Vegas", "ORD": "Chicago",
    "BOS": "Boston", "IAD": "Washington", "DCA": "Washington", "ATL": "Atlanta", "DFW": "Dallas", "IAH": "Houston",
    "SEA": "Seattle", "DEN": "Denver", "MSY": "Nova Orleans", "PHL": "Filadélfia", "HNL": "Honolulu",
    "YYZ": "Toronto", "YUL": "Montreal", "YVR": "Vancouver", "MEX": "Cidade do México", "CUN": "Cancún",
    "PUJ": "Punta Cana", "HAV": "Havana", "PTY": "Cidade do Panamá", "SJU": "San Juan", "AUA": "Aruba",
    "CUR": "Curaçao",
    # América do Sul
    "EZE": "Buenos Aires", "AEP": "Buenos Aires", "SCL": "Santiago", "MVD": "Montevidéu", "PDP": "Punta del Este",
    "LIM": "Lima", "CUZ": "Cusco", "BOG": "Bogotá", "MDE": "Medellín", "CTG": "Cartagena", "UIO": "Quito",
    "GYE": "Guayaquil", "ASU": "Assunção", "VVI": "Santa Cruz de la Sierra", "LPB": "La Paz", "CCS": "Caracas",
    "BRC": "Bariloche", "FTE": "El Calafate", "USH": "Ushuaia", "MDZ": "Mendoza", "COR": "Córdoba",
}

# Apelidos extras de busca (sem acento, minúsculos) além da cidade e do nome.
ALIASES = {
    "JFK": "nyc ny", "EWR": "nyc ny newark", "LGA": "nyc ny", "DXB": "emirados", "AUH": "emirados",
    "MLE": "maldivas", "DPS": "indonesia", "CDG": "charles de gaulle", "LHR": "heathrow", "GRU": "guarulhos sp",
    "CGH": "congonhas sp", "VCP": "viracopos", "GIG": "galeao rj", "SDU": "santos dumont rj",
}


def clean_city(raw):
    city = re.sub(r"\s*\(.*?\)", "", raw or "").strip()
    return city.split("/")[0].strip()


def main(src):
    airports = []
    coords = {}
    with open(src, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            code = r["iata_code"].strip().upper()
            if r["type"] not in ("large_airport", "medium_airport") or r["scheduled_service"] != "yes":
                continue
            if not re.fullmatch(r"[A-Z]{3}", code):
                continue
            city = PT_CITY.get(code) or clean_city(r["municipality"]) or r["name"]
            coords[code] = [round(float(r["longitude_deg"]), 2), round(float(r["latitude_deg"]), 2)]
            airports.append({
                "i": code,
                "c": city,
                "n": r["name"].strip(),
                "k": r["iso_country"],
                "l": r["type"] == "large_airport",
                **({"a": ALIASES[code]} if code in ALIASES else {}),
            })
    airports.sort(key=lambda a: (not a["l"], a["i"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(airports, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    COORDS.write_text(json.dumps(coords, separators=(",", ":")), encoding="utf-8")
    print(f"{len(airports)} aeroportos em {OUT} e coordenadas em {COORDS.name}")


if __name__ == "__main__":
    main(sys.argv[1])
