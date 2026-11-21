---
title: "个人简历"
permalink: /cv/
description: "教育、项目、实践与荣誉经历。"
author_profile: true
redirect_from:
  - /resume/
---
{% assign data = site.data.site_content %}
{% include content/page-intro.html key="cv" %}

<div class="cv-summary">
  <p class="cv-summary__name">{{ data.profile.name | escape }}{% if data.profile.nameEn %} / {{ data.profile.nameEn | escape }}{% endif %}</p>
  <p>{{ data.profile.headline | escape }}</p>
  <p>{{ data.profile.summary | escape }}</p>
  <div class="cv-summary__contact">
    {% if data.profile.email %}<a href="mailto:{{ data.profile.email | escape }}">{{ data.profile.email | escape }}</a>{% endif %}
  </div>
</div>

{% include content/section.html id="cv-education" title="教育经历" items=data.education %}
{% include content/section.html id="cv-projects" title="项目与科研" items=data.projects %}
{% include content/section.html id="cv-experiences" title="实习与实践" items=data.experiences %}
{% include content/section.html id="cv-awards" title="荣誉与奖项" items=data.awards %}
{% include content/section.html id="cv-skills" title="技能" items=data.skills %}
{% include content/section.html id="cv-talks" title="分享与讲座" items=data.talks %}
