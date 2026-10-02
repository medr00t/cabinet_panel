import React from 'react';

interface DateInputProps {
  value: string; // Expected in ISO format (yyyy-mm-dd)
  onChange: (value: string) => void; // Returns ISO format
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  min?: string; // ISO format
  max?: string; // ISO format
}

const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder: _placeholder, // Available but not used
  required = false,
  disabled = false,
  className = '',
  min,
  max
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // HTML date input always provides ISO format (yyyy-mm-dd)
    onChange(e.target.value);
  };

  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
        style={{
          // Ensure date picker uses French locale format
          fontFamily: 'inherit'
        }}
      />
      {!value && (
        <div className="absolute inset-y-0 left-0 pl-3 pr-3 flex items-center pointer-events-none text-gray-400 text-sm">
          jj/mm/aaaa
        </div>
      )}
    </div>
  );
};

export default DateInput;