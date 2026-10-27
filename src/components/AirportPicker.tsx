"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { countryName, searchAirports, type Airport } from "@/lib/airports";
import { Icon } from "./Icon";

let cache: Airport[] | null = null;

// A base (~64 KB comprimida) só é baixada quando o editor abre.
function useAirports(): Airport[] | null {
  const [list, setList] = useState<Airport[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    import("@/data/airports.json").then((m) => {
      cache = m.default as Airport[];
      setList(cache);
    });
  }, []);
  return list;
}

export function AirportPicker({
  label,
  value,
  onChange,
  placeholder = "Cidade, aeroporto ou código",
}: {
  label: string;
  value: Airport | null;
  onChange: (a: Airport | null) => void;
  placeholder?: string;
}) {
  const airports = useAirports();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const results = useMemo(() => (airports ? searchAirports(airports, query) : []), [airports, query]);

  function pick(a: Airport) {
    onChange(a);
    setQuery("");
    setOpen(false);
  }

  if (value) {
    return (
      <div className="ed-field">
        {label}
        <div className="ap-picked">
          <b>{value.i}</b> {value.c} · {countryName(value.k)}
          <button type="button" onClick={() => onChange(null)}>
            trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <label className="ed-field ap">
      {label}
      <input
        className="ed-input"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        placeholder={airports ? placeholder : "Carregando aeroportos…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
          else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && results.length > 0 && (
        <ul className="ap-list" id={`${id}-list`} role="listbox">
          {results.map((a, i) => (
            <li
              key={a.i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(a);
              }}
            >
              <b>{a.i}</b>
              <span>
                {a.c} · {countryName(a.k)}
                <span className="ap-name">{a.n}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && airports && query.trim().length >= 2 && results.length === 0 && (
        <ul className="ap-list" role="listbox">
          <li aria-selected="false">
            <Icon name="search" size={14} /> Nada encontrado para “{query}”.
          </li>
        </ul>
      )}
    </label>
  );
}
