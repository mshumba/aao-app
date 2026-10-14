import { View } from "react-native";
import { categories } from "../../data/categories";
import { space } from "../../theme";
import { TopicNotice, TopicRow } from "../../topics";
import { Page, PageTitle } from "../../ui";

export default function TopicLibrary() {
  return (
    <Page>
      <PageTitle
        title="Topics"
        lead="Find sermons by the part of your walk you want to grow in."
      />
      <View style={{ gap: space.md, marginTop: space.lg }}>
        {categories.map((category) => (
          <TopicRow key={category.id} category={category} />
        ))}
      </View>
      <View style={{ marginTop: space.lg }}>
        <TopicNotice />
      </View>
    </Page>
  );
}
