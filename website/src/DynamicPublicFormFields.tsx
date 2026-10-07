export type DynamicFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'CHECKBOX'
  | 'NUMBER'
  | 'CONSENT';

export interface DynamicFieldDefinition {
  key: string;
  label: string;
  type: DynamicFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export function DynamicPublicFormFields({
  fields,
  answers,
  onChange,
}: {
  fields: DynamicFieldDefinition[];
  answers: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) =>
    onChange({ ...answers, [key]: value });

  return (
    <>
      {fields.map((field) => {
        const value = answers[field.key];

        if (field.type === 'TEXT' || field.type === 'NUMBER') {
          return (
            <label key={field.key}>
              {field.label}
              <input
                required={field.required}
                type={field.type === 'NUMBER' ? 'number' : 'text'}
                placeholder={field.placeholder}
                value={
                  typeof value === 'string' || typeof value === 'number'
                    ? String(value)
                    : ''
                }
                onChange={(event) =>
                  set(
                    field.key,
                    field.type === 'NUMBER'
                      ? event.target.value
                      : event.target.value,
                  )
                }
              />
            </label>
          );
        }

        if (field.type === 'TEXTAREA') {
          return (
            <label key={field.key}>
              {field.label}
              <textarea
                required={field.required}
                maxLength={5000}
                placeholder={field.placeholder}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => set(field.key, event.target.value)}
              />
            </label>
          );
        }

        if (field.type === 'SELECT') {
          return (
            <label key={field.key}>
              {field.label}
              <select
                required={field.required}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => set(field.key, event.target.value)}
              >
                <option value="">Choose an option</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.type === 'MULTI_SELECT') {
          const selected = Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : [];
          return (
            <fieldset className="public-form-fieldset" key={field.key}>
              <legend>{field.label}</legend>
              {(field.options ?? []).map((option) => (
                <label className="public-check-row" key={option}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={(event) =>
                      set(
                        field.key,
                        event.target.checked
                          ? [...selected, option]
                          : selected.filter((item) => item !== option),
                      )
                    }
                  />
                  <span>{option}</span>
                </label>
              ))}
              {field.required && selected.length === 0 ? (
                <small>Select at least one option.</small>
              ) : null}
            </fieldset>
          );
        }

        const checked = value === true;
        return (
          <label className="public-check-row" key={field.key}>
            <input
              type="checkbox"
              required={field.required || field.type === 'CONSENT'}
              checked={checked}
              onChange={(event) => set(field.key, event.target.checked)}
            />
            <span>{field.label}</span>
          </label>
        );
      })}
    </>
  );
}

export function dynamicAnswersComplete(
  fields: DynamicFieldDefinition[],
  answers: Record<string, unknown>,
): boolean {
  return fields.every((field) => {
    if (!field.required && field.type !== 'CONSENT') return true;
    const value = answers[field.key];
    if (field.type === 'CONSENT') return value === true;
    if (field.type === 'CHECKBOX') return typeof value === 'boolean';
    if (field.type === 'MULTI_SELECT') return Array.isArray(value) && value.length > 0;
    return value !== undefined && value !== null && String(value).trim().length > 0;
  });
}
