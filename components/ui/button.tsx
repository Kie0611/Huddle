import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[transform,background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        outline: "border border-border bg-background hover:bg-muted hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
        toolActive: "bg-accent text-accent-foreground hover:bg-accent/90",
        // Landing variants
        landingPop: "border-2 border-landing-ink bg-landing-pop text-landing-ink shadow-playful hover:translate-y-[-2px] hover:shadow-playful-lg active:translate-y-0",
        landingLight: "border-2 border-landing-soft/40 bg-transparent text-landing-soft hover:bg-landing-soft/10",
        landingOutline: "border-2 border-landing-soft bg-transparent text-landing-soft hover:border-landing-soft hover:bg-landing-soft/10",
        landingDark: "border-2 border-landing-ink bg-landing-ink text-landing-soft shadow-playful hover:bg-landing-ink/90",
        landingSoft: "border-2 border-landing-soft bg-landing-soft text-landing-ink shadow-none hover:bg-landing-pop hover:text-landing-ink h-9 px-3 text-xs",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }