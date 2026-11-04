from django.db import migrations


GOALS = (
    "Erradicação da pobreza",
    "Fome zero e agricultura sustentável",
    "Saúde e bem-estar",
    "Educação de qualidade",
    "Igualdade de gênero",
    "Água potável e saneamento",
    "Energia limpa e acessível",
    "Trabalho decente e crescimento econômico",
    "Indústria, inovação e infraestrutura",
    "Redução das desigualdades",
    "Cidades e comunidades sustentáveis",
    "Consumo e produção responsáveis",
    "Ação contra a mudança global do clima",
    "Vida na água",
    "Vida terrestre",
    "Paz, justiça e instituições eficazes",
    "Parcerias e meios de implementação",
)


def seed_goals(apps, schema_editor):
    SustainableGoal = apps.get_model("ods", "SustainableGoal")
    for number, title in enumerate(GOALS, start=1):
        SustainableGoal.objects.using(schema_editor.connection.alias).get_or_create(
            number=number,
            defaults={
                "title": title,
                "official_url": f"https://brasil.un.org/pt-br/sdgs/{number}",
            },
        )


class Migration(migrations.Migration):
    dependencies = [("ods", "0001_initial")]

    operations = [migrations.RunPython(seed_goals, migrations.RunPython.noop)]
