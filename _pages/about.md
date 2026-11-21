---
permalink: /
title: "个人主页"
hide_title: true
author_profile: true
redirect_from:
  - /about/
  - /about.html
---
{% assign data = site.data.site_content %}

<div class="home-intro">
  <h1 class="home-intro__name">{{ data.profile.name | escape }}{% if data.profile.nameEn %}<span> / {{ data.profile.nameEn | escape }}</span>{% endif %}</h1>
  {% if data.profile.preferredName %}<p class="home-intro__preferred">常用英文名：{{ data.profile.preferredName | escape }}</p>{% endif %}
  <p class="home-intro__headline">{{ data.profile.headline | escape }}</p>
  <p class="home-intro__summary">{{ data.profile.summary | escape }}</p>
  {% if data.profile.motto %}<p class="home-intro__motto">{{ data.profile.motto | escape }}</p>{% endif %}

  {% if data.profile.researchInterests and data.profile.researchInterests.size > 0 %}
    <div class="home-intro__interests" aria-label="研究兴趣">
      <span>研究兴趣</span>
      <ul>
        {% for interest in data.profile.researchInterests %}
          {% if interest != "" %}<li>{{ interest | escape }}</li>{% endif %}
        {% endfor %}
      </ul>
    </div>
  {% endif %}

  <div class="home-intro__actions">
    {% if data.profile.email %}<a href="mailto:{{ data.profile.email | escape }}">联系我</a>{% endif %}
    <a href="{{ base_path }}/cv/">查看简历</a>
    {% if data.profile.links.github %}<a href="{{ data.profile.links.github | escape }}" target="_blank" rel="noopener noreferrer">GitHub</a>{% endif %}
  </div>
</div>

{% assign education = data.education | where: "featured", true %}
{% include content/section.html id="education" title="教育经历" items=education %}

{% assign projects = data.projects | where: "featured", true %}
{% include content/section.html id="projects" title="代表项目与科研" description="近期具有代表性的项目、研究与竞赛经历。" items=projects href="/projects/" %}

{% assign experiences = data.experiences | where: "featured", true %}
{% include content/section.html id="experiences" title="实习与实践" items=experiences href="/experience/" %}

{% assign awards = data.awards | where: "featured", true %}
{% include content/section.html id="awards" title="荣誉与奖项" items=awards href="/awards/" %}

{% assign talks = data.talks | where: "featured", true %}
{% include content/section.html id="talks" title="分享与讲座" items=talks href="/talks/" %}

{% assign notes = data.notes | where: "featured", true %}
{% include content/section.html id="notes" title="笔记与习题" items=notes href="/notes/" %}

{% assign outside = data.outsideResearch | where: "featured", true %}
{% include content/section.html id="outside" title="科研学习以外" items=outside href="/outside/" %}
