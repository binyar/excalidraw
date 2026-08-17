# nucleo-glass

A collection of 24px React SVG icon components from [Nucleo](https://nucleoapp.com/).

## Installation

```bash
npm install nucleo-glass
```

## Usage

```jsx
import { IconPin } from "nucleo-glass";

function MyComponent() {
  return <IconPin />;
}
```

Browse the full list of available icons on the [Nucleo Web App](https://nucleoapp.com/app/?library=glass).

## Customization

### Icon Size

You can set a custom size using the size prop:

```jsx
import { IconPin } from "nucleo-glass";

function MyComponent() {
  return <IconPin size={32} />;
}
```

### Icon Colors

Icon colors are controlled using CSS custom properties:

| CSS Custom Property     | Default Value |
| ----------------------- | ------------- |
| --nc-gradient-1-color-1 | #575757       |
| --nc-gradient-1-color-2 | #151515       |
| --nc-gradient-2-color-1 | #E3E3E599     |
| --nc-gradient-2-color-2 | #BBBBC099     |
| --nc-light              | #FFFFFF       |

You can modify them inline using the style attribute:

```jsx
<IconPin style={
  {
    '--nc-gradient-1-color-1': '#575757',
  } as React.CSSProperties
} />
```

Or you can use utility classes. For example, if using Tailwind CSS:

```jsx
<IconPin className="[--nc-gradient-1-color-1:#575757]" />
```

### ID Collisions

The Nucleo Glass icons use SVG definitions that rely on referenced IDs (for example: gradients, filters, masks, clipPaths). When rendering the same icon multiple times with different styles on the same page, those IDs can collide and cause unexpected styling.

To avoid this, you can pass a `uniqueId` prop to the icon. This way each instance remains isolated.

```jsx
import { useId } from "react";
import { IconAppStack } from "nucleo-glass";

export function MyComponent() {
  const glassId1 = useId();
  const glassId2 = useId();

  return (
    <div>
      {/* First instance */}
      <IconAppStack
        uniqueId={glassId1}
        style={{
          "--nc-gradient-1-color-1": "#FF7A00",
          "--nc-gradient-1-color-2": "#C40000",
        }}
      />

      {/* Second instance, different styles and a different uniqueId */}
      <IconAppStack
        uniqueId={glassId2}
        style={{
          "--nc-gradient-1-color-1": "#00C2FF",
          "--nc-gradient-1-color-2": "#0047C4",
        }}
      />
    </div>
  );
}
```

## Accessibility

To improve accessibility, you can either add a title attribute to the icon or use the aria-label attribute.

```jsx
<IconName title="Icon Name" />
```

or

```jsx
<IconName aria-label="Icon Name" />
```

If you want to hide the icon from screen readers, you can use the aria-hidden attribute.

```jsx
<IconName aria-hidden="true" />
```

## License

[nucleoapp.com/license](https://nucleoapp.com/license)
