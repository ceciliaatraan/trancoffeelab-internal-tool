"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

/**
 * Drop-in ersättning för <button type="submit"> inuti en <form action={...}>
 * - måste renderas som barn till formuläret (useFormStatus läser kontext
 * från närmaste förälder-<form>, funkar inte i samma komponent som
 * definierar formuläret självt). Visar automatiskt en spinner och
 * inaktiverar knappen medan formuläret skickas, utan att röra layouten
 * (ingen flex/justify - spinnern är bara inline före texten, så knappens
 * befintliga text-align/bredd beter sig exakt som innan).
 */
export function SubmitButton({
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={`disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {pending ? <Spinner className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" /> : null}
      {children}
    </button>
  );
}
