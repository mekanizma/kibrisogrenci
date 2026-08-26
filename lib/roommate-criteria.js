export const ROOMMATE_DEFAULTS = {
  marital_status: 'any',
  age_min: null,
  age_max: null,
  employment: 'any',
  university_id: null,
  pets: 'any',
  smoking: 'any',
};

const RM = 'rm:';

export function isRoommateTag(value) {
  return typeof value === 'string' && value.startsWith(RM);
}

export function stripRoommateTags(amenities) {
  return (amenities || []).filter((a) => !isRoommateTag(a));
}

export function encodeRoommateTags(criteria) {
  const c = criteria || ROOMMATE_DEFAULTS;
  const tags = [];
  if (c.marital_status && c.marital_status !== 'any') tags.push(`${RM}marital:${c.marital_status}`);
  if (c.age_min != null) tags.push(`${RM}age_min:${c.age_min}`);
  if (c.age_max != null) tags.push(`${RM}age_max:${c.age_max}`);
  if (c.employment && c.employment !== 'any') tags.push(`${RM}employment:${c.employment}`);
  if (c.university_id) tags.push(`${RM}uni:${c.university_id}`);
  if (c.pets && c.pets !== 'any') tags.push(`${RM}pets:${c.pets}`);
  if (c.smoking && c.smoking !== 'any') tags.push(`${RM}smoking:${c.smoking}`);
  return tags;
}

export function decodeRoommateFromAmenities(amenities) {
  const tags = (amenities || []).filter(isRoommateTag);
  if (!tags.length) return null;
  const out = { ...ROOMMATE_DEFAULTS };
  for (const tag of tags) {
    const body = tag.slice(RM.length);
    const i = body.indexOf(':');
    if (i < 0) continue;
    const key = body.slice(0, i);
    const val = body.slice(i + 1);
    if (key === 'marital') out.marital_status = val;
    else if (key === 'age_min') out.age_min = Number(val) || null;
    else if (key === 'age_max') out.age_max = Number(val) || null;
    else if (key === 'employment') out.employment = val;
    else if (key === 'uni') out.university_id = val;
    else if (key === 'pets') out.pets = val;
    else if (key === 'smoking') out.smoking = val;
  }
  return out;
}

export function mergeAmenitiesWithRoommate(amenities, criteria) {
  const base = stripRoommateTags(amenities);
  return [...base, ...encodeRoommateTags(criteria)];
}

export function normalizeRoommateCriteria(body = {}) {
  const src = body.roommate_criteria && typeof body.roommate_criteria === 'object'
    ? body.roommate_criteria
    : body;
  const ageMin = src.roommate_age_min ?? src.age_min;
  const ageMax = src.roommate_age_max ?? src.age_max;
  const uni = src.roommate_university_id ?? src.university_id;
  const parseAge = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return {
    marital_status: src.roommate_marital_status || src.marital_status || 'any',
    age_min: parseAge(ageMin),
    age_max: parseAge(ageMax),
    employment: src.roommate_employment || src.employment || 'any',
    university_id: uni || null,
    pets: src.roommate_pets || src.pets || 'any',
    smoking: src.roommate_smoking || src.smoking || 'any',
  };
}

export function parseRoommateCriteria(row) {
  if (row?.roommate_criteria && typeof row.roommate_criteria === 'object') {
    return normalizeRoommateCriteria(row.roommate_criteria);
  }
  const fromAmenities = decodeRoommateFromAmenities(row?.amenities);
  if (fromAmenities) return fromAmenities;
  return { ...ROOMMATE_DEFAULTS };
}

export function hasRoommateCriteria(criteria, genderPreference = 'any') {
  if (genderPreference && genderPreference !== 'any') return true;
  if (!criteria) return false;
  return (
    (criteria.marital_status && criteria.marital_status !== 'any')
    || criteria.age_min != null
    || criteria.age_max != null
    || (criteria.employment && criteria.employment !== 'any')
    || !!criteria.university_id
    || (criteria.pets && criteria.pets !== 'any')
    || (criteria.smoking && criteria.smoking !== 'any')
  );
}

export function roommateCriteriaToForm(criteria) {
  const c = criteria || ROOMMATE_DEFAULTS;
  return {
    roommate_marital_status: c.marital_status || 'any',
    roommate_age_min: c.age_min != null ? String(c.age_min) : '',
    roommate_age_max: c.age_max != null ? String(c.age_max) : '',
    roommate_employment: c.employment || 'any',
    roommate_university_id: c.university_id || '',
    roommate_pets: c.pets || 'any',
    roommate_smoking: c.smoking || 'any',
  };
}

export function formatAgeRange(criteria, locale = 'tr') {
  const min = criteria?.age_min;
  const max = criteria?.age_max;
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return locale === 'tr' ? `${min}+` : `${min}+`;
  if (max != null) return locale === 'tr' ? `${max} yaşa kadar` : `Up to ${max}`;
  return null;
}
