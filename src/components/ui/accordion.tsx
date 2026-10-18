"use client";
// Adapted from shadcn/ui Accordion (MIT), styled with local CSS.

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { clsx as cn } from "clsx";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("shadcn-accordion-item", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="shadcn-accordion-header">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn("shadcn-accordion-trigger", className)}
        {...props}
      >
        {children}
        <ChevronDownIcon className="shadcn-accordion-chevron" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="shadcn-accordion-content"
      {...props}
    >
      <div className={cn("shadcn-accordion-body", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
