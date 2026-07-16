function typeMatches(type, value) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function validateNode(schema, value, path, errors) {
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path} must equal the declared constant`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must use an allowed value`);
  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push(`${path} must be ${schema.type}`);
    return;
  }
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (value[required] === undefined) errors.push(`${path}.${required} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (value[key] !== undefined) validateNode(child, value[key], `${path}.${key}`, errors);
    }
  }
  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} has too many items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} must be unique`);
    if (schema.items) value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, errors));
  }
  if (schema.type === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern, "u")).test(value)) errors.push(`${path} is malformed`);
  }
  if ((schema.type === "integer" || schema.type === "number") && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} is too small`);
  if ((schema.type === "integer" || schema.type === "number") && schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} is too large`);
}

export function validateSchema(schema, value) {
  const errors = [];
  validateNode(schema, value, "$", errors);
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
