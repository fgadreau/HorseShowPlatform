import { useState } from "react";
import { EmptyState, Metric, ViewIntro } from "../../components/ui";
import type { Organization } from "../../types/domain";
import type { ViewKey } from "../../types/ui";
import { notificationCategoryFilters, notificationPriorityLabel, type NotificationCategory, type NotificationItem, type NotificationPriority } from "../dashboard/shared";

function NotificationsView({
  notifications,
  organization,
  onViewChange,
}: {
  notifications: NotificationItem[];
  organization: Organization | null;
  onViewChange: (view: ViewKey) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | NotificationCategory>("all");
  const criticalCount = notifications.filter((notification) => notification.priority === "critical").length;
  const warningCount = notifications.filter((notification) => notification.priority === "warning").length;
  const infoCount = notifications.filter((notification) => notification.priority === "info").length;
  const visibleNotifications = categoryFilter === "all" ? notifications : notifications.filter((notification) => notification.category === categoryFilter);

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow="Operations"
        title="Centre de notifications"
        description="Surveille les tâches calculées depuis la santé, les inscriptions, les dossards, les memberships et la facturation."
        stats={[
          { label: "Urgentes", value: String(criticalCount) },
          { label: "À traiter", value: String(warningCount) },
          { label: "Infos", value: String(infoCount) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric detail={organization?.name ?? "Association active"} label="Urgentes" value={String(criticalCount)} />
        <Metric detail="Validation ou correction requise." label="À traiter" value={String(warningCount)} />
        <Metric detail="Suivi opérationnel." label="Information" value={String(infoCount)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>Tâches calculées</h2>
            <p>{notifications.length ? `${notifications.length} notification${notifications.length === 1 ? "" : "s"} active${notifications.length === 1 ? "" : "s"}.` : "Rien à traiter pour l'instant."}</p>
          </div>
        </div>

        <div className="notification-filter-row">
          {notificationCategoryFilters.map((filter) => {
            const count = filter.key === "all" ? notifications.length : notifications.filter((notification) => notification.category === filter.key).length;

            return (
              <button className={categoryFilter === filter.key ? "active" : ""} key={filter.key} type="button" onClick={() => setCategoryFilter(filter.key)}>
                {filter.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="notification-list">
          {visibleNotifications.map((notification) => (
            <article className={`notification-card ${notification.priority}`} key={notification.id}>
              <div className="notification-card-main">
                <span className={`notification-priority ${notification.priority}`}>{notificationPriorityLabel(notification.priority)}</span>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.detail}</p>
                  <small>{notification.meta}</small>
                </div>
              </div>
              <button className="text-button" type="button" onClick={() => onViewChange(notification.view)}>
                {notification.actionLabel}
              </button>
            </article>
          ))}
          {!visibleNotifications.length ? <EmptyState label={categoryFilter === "all" ? "Aucune notification active." : "Aucune notification dans cette catégorie."} /> : null}
        </div>
      </section>
    </div>
  );
}

export { NotificationsView };
