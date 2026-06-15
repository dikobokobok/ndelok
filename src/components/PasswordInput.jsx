import React, { useState, forwardRef } from 'react'

/**
 * Reusable password input with show/hide eye toggle.
 * Drop-in replacement for <input type="password" />.
 *
 * Wraps the input + eye button in a relative container.
 * Pass standard input props (value, onChange, placeholder, disabled, etc).
 *
 * Optional:
 *  - wrapperClassName: classes for the outer relative wrapper
 *  - className: classes for the input itself (mirrors native)
 *  - eyeColor: tailwind text-color class for the eye icon (default text-slate-400)
 */
const PasswordInput = React.memo(forwardRef(function PasswordInput(
  { wrapperClassName = '', className = '', eyeColor = 'text-slate-400', disabled, ...rest },
  ref
) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={`pr-10 ${className}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        disabled={disabled}
        tabIndex={-1}
        aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        title={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        className={`absolute inset-y-0 right-0 flex items-center justify-center w-10 ${eyeColor} hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-outlined text-[18px]">
          {visible ? 'visibility_off' : 'visibility'}
        </span>
      </button>
    </div>
  )
}))

export default PasswordInput