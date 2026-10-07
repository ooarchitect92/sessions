export type PublicFormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'SELECT'
  | 'CHECKBOX'
  | 'CONSENT';

export interface PublicFormField {
  key: string;
  label: string;
  type: PublicFormFieldType;
  required: boolean;
  placeholder?: string;
  options: string[];
}

export type PublicFormAnswers = Record<string, string | boolean>;

export function PublicCustomFields({
  fields,
  answers,
  onChange,
}: {
  fields: PublicFormField[];
  answers: PublicFormAnswers;
  onChange: (key: string, value: string | boolean) => void;
}) {
  return (
    <>
      {fields.map((field) => {
        const answer = answers[field.key];
        if (field.type === 'CHECKBOX' || field.type === 'CONSENT') {
          return (
            <label className="public-checkbox-field" key={field.key}>
              <input
                checked={answer === true}
                onChange={(event) => onChange(field.key, event.target.checked)}
                required={field.required}
                type="checkbox"
              />
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
            </label>
          );
        }

        if (field.type === 'TEXTAREA') {
          return (
            <label key={field.key}>
              {field.label}
              {field.required ? ' *' : ''}
              <textarea
                maxLength={5000}
                placeholder={field.placeholder}
                required={field.required}
                value={typeof answer === 'string' ? answer : ''}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            </label>
          );
        }

        if (field.type === 'SELECT') {
          return (
            <label key={field.key}>
              {field.label}
              {field.required ? ' *' : ''}
              <select
                required={field.required}
                value={typeof answer === 'string' ? answer : ''}
                onChange={(event) => onChange(field.key, event.target.value)}
              >
                <option value="">Select an option</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={field.key}>
            {field.label}
            {field.required ? ' *' : ''}
            <input
              maxLength={5000}
              placeholder={field.placeholder}
              required={field.required}
              value={typeof answer === 'string' ? answer : ''}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </label>
        );
      })}
    </>
  );
}
