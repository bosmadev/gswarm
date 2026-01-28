/**
 * @file app/dashboard/components/configuration-panel.tsx
 * @description Configuration Panel component for managing GSwarm settings.
 * Provides accordion sections for Google Search, Generation Defaults,
 * System Prompts, and Rate Limiting with form validation.
 *
 * @module app/dashboard/components/configuration-panel
 */

"use client";

import { RotateCcw, Save, Search, Settings, Sparkles, Zap } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { useNotifications } from "@/components/providers";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  z,
  zodResolver,
} from "@/components/ui/form";
import { NumberInput } from "@/components/ui/number-input";
import { Slider } from "@/components/ui/slider";
import { LabeledSwitch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

const configurationSchema = z.object({
  // Google Search Settings
  googleSearch: z.object({
    enabled: z.boolean(),
    maxResults: z.number().min(1).max(100),
  }),
  // Generation Defaults
  generation: z.object({
    maxTokens: z.number().min(1).max(32000),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    topK: z.number().min(1).max(100),
  }),
  // System Prompts
  systemPrompts: z.object({
    default: z.string(),
    general: z.string(),
  }),
  // Rate Limiting
  rateLimiting: z.object({
    requestsPerMinute: z.number().min(1).max(1000),
    burstLimit: z.number().min(1).max(100),
  }),
});

type ConfigurationFormData = z.infer<typeof configurationSchema>;

const DEFAULT_VALUES: ConfigurationFormData = {
  googleSearch: {
    enabled: true,
    maxResults: 10,
  },
  generation: {
    maxTokens: 4096,
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
  },
  systemPrompts: {
    default: "",
    general: "",
  },
  rateLimiting: {
    requestsPerMinute: 60,
    burstLimit: 10,
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export interface ConfigurationPanelProps {
  /** Initial configuration values */
  initialValues?: Partial<ConfigurationFormData>;
  /** Callback when configuration is saved */
  onSave?: (values: ConfigurationFormData) => Promise<void>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Configuration Panel component.
 * Provides accordion sections for managing various GSwarm settings.
 *
 * @component
 * @example
 * ```tsx
 * <ConfigurationPanel
 *   initialValues={{ googleSearch: { enabled: true, maxResults: 10 } }}
 *   onSave={async (values) => await saveConfig(values)}
 * />
 * ```
 */
export function ConfigurationPanel({
  initialValues,
  onSave,
  className,
}: ConfigurationPanelProps) {
  const { success, error } = useNotifications();
  const [isSaving, setIsSaving] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>([
    "google-search",
    "generation",
  ]);

  const form = useForm<ConfigurationFormData>({
    resolver: zodResolver(configurationSchema),
    defaultValues: {
      ...DEFAULT_VALUES,
      ...initialValues,
    },
  });

  const handleSubmit = useCallback(
    async (values: ConfigurationFormData) => {
      setIsSaving(true);
      try {
        if (onSave) {
          await onSave(values);
        }
        success("Configuration saved successfully");
      } catch (err) {
        error(
          err instanceof Error ? err.message : "Failed to save configuration",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [onSave, success, error],
  );

  const handleReset = useCallback(() => {
    form.reset(DEFAULT_VALUES);
  }, [form]);

  const isDirty = form.formState.isDirty;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration
            </CardTitle>
            <CardDescription>
              Manage your GSwarm API configuration settings
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={handleReset}
              disabled={!isDirty || isSaving}
            >
              Reset to Defaults
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="w-4 h-4" />}
              onClick={form.handleSubmit(handleSubmit)}
              disabled={!isDirty}
              loading={isSaving}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <Accordion
              type="multiple"
              value={openSections}
              onValueChange={setOpenSections}
              className="w-full"
            >
              {/* Google Search Settings */}
              <AccordionItem value="google-search">
                <AccordionTrigger className="text-base">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Google Search Settings
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="googleSearch.enabled"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <LabeledSwitch
                            checked={field.value}
                            onChange={field.onChange}
                            label="Enable Google Search"
                            description="Allow the API to perform Google searches for context"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="googleSearch.maxResults"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Results</FormLabel>
                        <FormControl>
                          <NumberInput
                            value={field.value}
                            onChange={field.onChange}
                            min={1}
                            max={100}
                            step={1}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum number of search results to return (1-100)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Generation Defaults */}
              <AccordionItem value="generation">
                <AccordionTrigger className="text-base">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Generation Defaults
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-6 pt-4">
                  <FormField
                    control={form.control}
                    name="generation.maxTokens"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Tokens</FormLabel>
                        <FormControl>
                          <NumberInput
                            value={field.value}
                            onChange={field.onChange}
                            min={1}
                            max={32000}
                            step={256}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum tokens in generated response (1-32000)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="generation.temperature"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Temperature</FormLabel>
                          <span className="text-sm text-text-secondary font-mono">
                            {field.value.toFixed(2)}
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={0}
                            max={2}
                            step={0.01}
                          />
                        </FormControl>
                        <FormDescription>
                          Controls randomness in generation (0 = deterministic,
                          2 = very random)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="generation.topP"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Top P (Nucleus Sampling)</FormLabel>
                          <span className="text-sm text-text-secondary font-mono">
                            {field.value.toFixed(2)}
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={0}
                            max={1}
                            step={0.01}
                          />
                        </FormControl>
                        <FormDescription>
                          Cumulative probability threshold for token selection
                          (0-1)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="generation.topK"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Top K</FormLabel>
                          <span className="text-sm text-text-secondary font-mono">
                            {field.value}
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={1}
                            max={100}
                            step={1}
                          />
                        </FormControl>
                        <FormDescription>
                          Number of top tokens to consider for sampling (1-100)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* System Prompts */}
              <AccordionItem value="system-prompts">
                <AccordionTrigger className="text-base">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    System Prompts
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="systemPrompts.default"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default System Prompt</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            className="flex min-h-32 w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-orange focus:border-orange transition-all disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                            placeholder="Enter the default system prompt for API requests..."
                          />
                        </FormControl>
                        <FormDescription>
                          The default system prompt used when none is provided
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="systemPrompts.general"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>General System Prompt</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            className="flex min-h-32 w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-orange focus:border-orange transition-all disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                            placeholder="Enter a general system prompt that applies to all requests..."
                          />
                        </FormControl>
                        <FormDescription>
                          A general prompt prepended to all requests
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Rate Limiting */}
              <AccordionItem value="rate-limiting">
                <AccordionTrigger className="text-base">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Rate Limiting
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="rateLimiting.requestsPerMinute"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Requests Per Minute</FormLabel>
                        <FormControl>
                          <NumberInput
                            value={field.value}
                            onChange={field.onChange}
                            min={1}
                            max={1000}
                            step={10}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum number of API requests allowed per minute
                          (1-1000)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rateLimiting.burstLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Burst Limit</FormLabel>
                        <FormControl>
                          <NumberInput
                            value={field.value}
                            onChange={field.onChange}
                            min={1}
                            max={100}
                            step={1}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum concurrent requests allowed in a burst (1-100)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
