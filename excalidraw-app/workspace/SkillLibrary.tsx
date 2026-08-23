import { useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, PackageSearch, Plus, Search } from "lucide-react";

import { type AgentSkill, skillApi } from "./skills";
import "./SkillLibrary.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const SkillIcon = ({ skill }: { skill: AgentSkill }) =>
  skill.icon === "animation" ? <Clapperboard /> : <PackageSearch />;

const SkillCard = ({
  skill,
  busy,
  onToggle,
}: {
  skill: AgentSkill;
  busy: boolean;
  onToggle: (skill: AgentSkill, enabled: boolean) => void;
}) => (
  <article className="skill-card">
    <div className={`skill-card__icon skill-card__icon--${skill.icon}`}>
      <SkillIcon skill={skill} />
    </div>
    <div className="skill-card__content">
      <div className="skill-card__title-row">
        <h3>{skill.name}</h3>
        <span>{skill.version}</span>
        {skill.builtIn && <small>内置</small>}
      </div>
      <p>{skill.description}</p>
    </div>
    {skill.enabled ? (
      <Switch
        aria-label={`${skill.name}${skill.locked ? "始终启用" : "启用状态"}`}
        checked
        disabled={skill.locked || busy}
        onCheckedChange={(enabled) => onToggle(skill, enabled)}
        className="skill-card__switch"
      />
    ) : (
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label={`添加${skill.name}`}
        disabled={busy}
        onClick={() => onToggle(skill, true)}
        className="skill-card__add"
      >
        <Plus />
      </Button>
    )}
  </article>
);

export const SkillLibrary = ({
  onEnabledChange,
}: {
  onEnabledChange: (count: number) => void;
}) => {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSkills = useCallback(async () => {
    try {
      const result = await skillApi.list();
      setSkills(result.skills);
      onEnabledChange(result.enabledCount);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "技能加载失败");
    } finally {
      setLoading(false);
    }
  }, [onEnabledChange]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? skills.filter((skill) =>
          `${skill.name} ${skill.description}`
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : skills;
  }, [query, skills]);
  const enabledSkills = filteredSkills.filter((skill) => skill.enabled);
  const disabledSkills = filteredSkills.filter((skill) => !skill.enabled);

  const toggleSkill = async (skill: AgentSkill, enabled: boolean) => {
    if (skill.locked) {
      return;
    }
    setBusyId(skill.id);
    try {
      const updated = enabled
        ? await skillApi.enable(skill.id)
        : await skillApi.disable(skill.id);
      const nextSkills = skills.map((item) =>
        item.id === updated.id ? updated : item,
      );
      setSkills(nextSkills);
      onEnabledChange(nextSkills.filter((item) => item.enabled).length);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "技能更新失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="skill-library">
      <header className="skill-library__header">
        <h1>Skills</h1>
        <label className="skill-library__search">
          <Search aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Skill"
            aria-label="搜索 Skill"
          />
        </label>
      </header>

      {error && <p className="skill-library__error">{error}</p>}
      {loading ? (
        <p className="skill-library__empty">正在加载技能…</p>
      ) : (
        <>
          <section className="skill-library__section">
            <h2>已安装</h2>
            <div className="skill-library__grid">
              {enabledSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  busy={busyId === skill.id}
                  onToggle={toggleSkill}
                />
              ))}
            </div>
          </section>

          <section className="skill-library__section">
            <h2>未安装</h2>
            {disabledSkills.length ? (
              <div className="skill-library__grid">
                {disabledSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    busy={busyId === skill.id}
                    onToggle={toggleSkill}
                  />
                ))}
              </div>
            ) : (
              <p className="skill-library__empty">
                {query ? "没有匹配的未安装技能" : "暂无未安装技能"}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
};
