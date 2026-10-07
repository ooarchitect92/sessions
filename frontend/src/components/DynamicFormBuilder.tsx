import type {
  DynamicFormField,
  DynamicFormFieldType,
} from '@sessions/contracts';

const FIELD_TYPES: Array<{ value: DynamicFormFieldType; label: string }> = [
  { value: 'TEXT', label: 'Short text' },
  { value: 'TEXTAREA', label: 'Long text' },
  { value: 'SELECT', label: 'Dropdown' },
  { value: 'MULTI_SELECT', label: 'Multiple choice' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'CONSENT', label: 'Consent' },
];

function fieldKey(label: string, existing: DynamicFormField[]): string {
  const base =
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[^a-z]+/, '') || 'field';
  let candidate = base.slice(0, 70);
  let suffix = 2;
  while (existing.some((field) => field.key === candidate)) {
    candidate = `${base.slice(0, 64)}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function DynamicFormBuilder({
  title,
  fields,
  onChange,
}: {
  title: string;
  fields: DynamicFormField[];
  onChange: (fields: DynamicFormField[]) => void;
}) {
  const update = (index: number, patch: Partial<DynamicFormField>) => {
    onChange(
      fields.map((field, current) =>
        current === index ? { ...field, ...patch } : field,
      ),
    );
  };

  const add = () => {
    const label = `Question ${fields.length + 1}`;
    onChange([
      ...fields,
      {
        key: fieldKey(label, fields),
        label,
        type: 'TEXT',
        required: false,
      },
    ]);
  };

  return (
    <div className="dynamic-form-builder">
      <div className="dynamic-form-builder-heading">
        <div>
          <strong>{title}</strong>
          <small>
            Add optional questions, choices, numeric fields, or required consent.
          </small>
        </div>
        <button type="button" className="button secondary" onClick={add}>
          Add field
        </button>
      </div>

      {fields.length === 0 ? (
        <div className="dynamic-form-empty">No additional fields configured.</div>
      ) : (
        <div className="dynamic-form-field-list">
          {fields.map((field, index) => {
            const supportsOptions =
              field.type === 'SELECT' || field.type === 'MULTI_SELECT';
            return (
              <div className="dynamic-form-field-card" key={field.key}>
                <div className="form-grid">
                  <label>
                    Label
                    <input
                      value={field.label}
                      maxLength={160}
                      onChange={(event) =>
                        update(index, { label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={field.type}
                      onChange={(event) => {
                        const type = event.target.value as DynamicFormFieldType;
                        update(index, {
                          type,
                          ...(type === 'CONSENT' ? { required: true } : {}),
                          ...(type === 'SELECT' || type === 'MULTI_SELECT'
                            ? { options: field.options?.length ? field.options : ['Option 1'] }
                            : { options: [] }),
                        });
                      }}
                    >
                      {FIELD_TYPES.map((item) => (
                        <option value={item.value} key={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  Stable field key
                  <input
                    value={field.key}
                    maxLength={80}
                    onChange={(event) =>
                      update(index, {
                        key: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, '')
                          .replace(/^[^a-z]+/, ''),
                      })
                    }
                  />
                </label>

                {supportsOptions ? (
                  <label>
                    Options
                    <input
                      value={(field.options ?? []).join(', ')}
                      placeholder="Option 1, Option 2"
                      onChange={(event) =>
                        update(index, {
                          options: event.target.value
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                ) : null}

                {field.type !== 'CONSENT' ? (
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={field.required === true}
                      onChange={(event) =>
                        update(index, { required: event.target.checked })
                      }
                    />
                    <span>
                      <strong>Required</strong>
                      <small>Submission is blocked until this field is completed.</small>
                    </span>
                  </label>
                ) : (
                  <div className="dynamic-form-consent-note">
                    Consent fields are always required and must be explicitly accepted.
                  </div>
                )}

                <button
                  type="button"
                  className="settings-row-action danger-text"
                  onClick={() =>
                    onChange(fields.filter((_, current) => current !== index))
                  }
                >
                  Remove field
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
