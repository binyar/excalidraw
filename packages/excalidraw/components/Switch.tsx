import { Switch as SwitchPrimitive } from "radix-ui";

export type SwitchProps = {
  name: string;
  checked: boolean;
  title?: string;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export const Switch = ({
  title,
  name,
  checked,
  onChange,
  disabled = false,
}: SwitchProps) => {
  return (
    <SwitchPrimitive.Root
      name={name}
      id={name}
      title={title}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      className="Switch peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary"
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
};
