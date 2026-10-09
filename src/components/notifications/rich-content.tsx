import { notificationHtml } from "@/lib/notifications/content"

export function NotificationRichContent({ content }: { content: string }) {
  return <div className="space-y-3 break-words text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 [&_a]:text-primary [&_a]:underline [&_a[data-cell-button=true]]:inline-flex [&_a[data-cell-button=true]]:rounded-lg [&_a[data-cell-button=true]]:bg-primary [&_a[data-cell-button=true]]:px-4 [&_a[data-cell-button=true]]:py-2 [&_a[data-cell-button=true]]:font-semibold [&_a[data-cell-button=true]]:text-primary-foreground [&_a[data-cell-button=true]]:no-underline" dangerouslySetInnerHTML={{ __html: notificationHtml(content) }} />
}
