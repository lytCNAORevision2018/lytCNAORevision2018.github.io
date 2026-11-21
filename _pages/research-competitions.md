---
permalink: /projects/
title: "项目与科研"
description: "科研项目、竞赛项目与实践成果。"
author_profile: true
redirect_from:
  - /research-competitions/
---
{% assign data = site.data.site_content %}
{% include content/page-intro.html key="projects" %}
{% include content/section.html id="projects" title="全部项目" items=data.projects %}

