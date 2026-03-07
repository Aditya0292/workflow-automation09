'use client';

import { useState } from 'react';

export function Switch({ defaultChecked = false, onCheckedChange, disabled = false, ...props }) {
    const [checked, setChecked] = useState(defaultChecked);

    const handleToggle = () => {
        if (disabled) return;
        const newChecked = !checked;
        setChecked(newChecked);
        if (onCheckedChange) {
            onCheckedChange(newChecked);
        }
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-black ${checked ? 'bg-emerald-500' : 'bg-gray-700'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            {...props}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
            />
        </button>
    );
}
