import { PageHeader } from '../../components/PageHeader';
import { BrandForm } from './BrandForm';
import { CompetitorEditor } from './CompetitorEditor';
import { PagesSection } from './PagesSection';
import { PromptEditor } from './PromptEditor';
import { PublishingForm } from './PublishingForm';

const SECTIONS = [
  { id: 'brand', title: 'Brand and engines', body: <BrandForm /> },
  { id: 'competitors', title: 'Competitors', body: <CompetitorEditor /> },
  { id: 'questions', title: 'Buyer questions', body: <PromptEditor /> },
  { id: 'pages', title: 'Your pages', body: <PagesSection /> },
  { id: 'publishing', title: 'Publishing', body: <PublishingForm /> },
];

export function SettingsPage() {
  return (
    <div className="settings">
      <PageHeader title="Settings" />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() =>
                document
                  .getElementById(`settings-${section.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {section.title}
            </button>
          ))}
        </nav>
        <div className="settings-sections">
          {SECTIONS.map((section) => (
            <section key={section.id} id={`settings-${section.id}`} className="settings-section">
              <h2>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
