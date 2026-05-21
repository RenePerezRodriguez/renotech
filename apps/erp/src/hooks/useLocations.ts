import { useState, useEffect, useCallback } from 'react';

export interface LocationCountry {
    name_es: string;
    name_en: string;
    code: string;
    flag: string;
    region: string;
}

export interface GroupedCountries {
    [region: string]: LocationCountry[];
}

const REGION_MAP: Record<string, string> = {
    'Americas': 'América',
    'Europe': 'Europa',
    'Asia': 'Asia',
    'Africa': 'África',
    'Oceania': 'Oceanía',
    'Antarctic': 'Antártida'
};

export function useLocations() {
    const [countries, setCountries] = useState<LocationCountry[]>([]);
    const [groupedCountries, setGroupedCountries] = useState<GroupedCountries>({});
    const [loading, setLoading] = useState(true);

    const fetchCountries = useCallback(async () => {
        const cached = sessionStorage.getItem('locations_countries_v3');
        if (cached) {
            const data = JSON.parse(cached);
            setCountries(data.countries);
            setGroupedCountries(data.grouped);
            setLoading(false);
            return;
        }

        try {
            const resp = await fetch('https://restcountries.com/v3.1/all?fields=name,translations,cca2,flags,region');
            const data = await resp.json();

            const processed: LocationCountry[] = data.map((c: { name: { common: string }; translations?: { spa?: { common: string } }; cca2: string; flags: { svg: string; png: string }; region: string }) => ({
                name_es: c.translations?.spa?.common || c.name.common,
                name_en: c.name.common,
                code: c.cca2,
                flag: c.flags.svg || c.flags.png,
                region: REGION_MAP[c.region] || c.region
            })).sort((a: LocationCountry, b: LocationCountry) => a.name_es.localeCompare(b.name_es));

            const grouped = processed.reduce((acc: GroupedCountries, country) => {
                const reg = country.region;
                if (!acc[reg]) acc[reg] = [];
                acc[reg].push(country);
                return acc;
            }, {});

            setCountries(processed);
            setGroupedCountries(grouped);
            sessionStorage.setItem('locations_countries_v3', JSON.stringify({ countries: processed, grouped }));
        } catch (error) {
            console.error("Error fetching countries", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCountries();
    }, [fetchCountries]);

    const cleanLocationName = (name: string) => {
        return name
            .replace(/\sDepartment$/i, '')
            .replace(/\sProvince$/i, '')
            .replace(/\sState$/i, '')
            .replace(/\sRegion$/i, '')
            .replace(/\sCommune$/i, '')
            .replace(/\sDistrict$/i, '')
            .trim();
    };

    const getStates = async (countryEn: string) => {
        const cacheKey = `states_v2_${countryEn}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);

        try {
            const resp = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: countryEn })
            });
            const data = await resp.json();
            const states = (data.data?.states || [])
                .map((s: { name: string }) => cleanLocationName(s.name));
            sessionStorage.setItem(cacheKey, JSON.stringify(states));
            return states;
        } catch (error) {
            console.error("Error fetching states", error);
            return [];
        }
    };

    const getCities = async (countryEn: string, stateName: string) => {
        const cacheKey = `cities_${countryEn}_${stateName}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);

        try {
            const resp = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: countryEn, state: stateName })
            });
            const data = await resp.json();
            const cities = data.data || [];
            sessionStorage.setItem(cacheKey, JSON.stringify(cities));
            return cities;
        } catch (error) {
            console.error("Error fetching cities", error);
            return [];
        }
    };

    return { countries, groupedCountries, loading, getStates, getCities };
}
